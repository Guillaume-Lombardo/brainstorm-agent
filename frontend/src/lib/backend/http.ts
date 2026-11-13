import { BackendError, codeForStatus } from "./errors";
import type { paths } from "./generated/api";
import { signBackendToken, type BackendJwtSettings } from "./jwt";
import type {
  BacklogExport,
  CommentInput,
  ConversationTurn,
  CreateSessionResponse,
  DocumentDiff,
  ExportJsonResponse,
  ExportMarkdownResponse,
  OidcRequest,
  ReviewInput,
  SessionOverview,
  SessionPage,
  SessionPatch,
  SliceSpecsExport,
  Stage,
  StepDocument,
  UserResponse,
} from "./types";

export interface HttpBackendOptions {
  /** Backend base URL on the internal network, e.g. `http://backend:8000`. */
  baseUrl: string;
  /** `X-Auth-Bridge` secret of the server-to-server login bridge (ADR 0009). */
  bridgeSecret: string;
  jwt: BackendJwtSettings;
  fetchImpl?: typeof fetch;
}

/** Identity forwarded to the backend as `sub` of the short-lived JWT. */
export interface Caller {
  userId: string;
}

type Auth = { caller: Caller } | { bridge: true };
type Method = "get" | "post" | "patch";
type Path = keyof paths;
type Operation<P extends Path, M extends Method> = NonNullable<paths[P][M]>;
type JsonContent<R> = R extends { content: { "application/json": infer T } } ? T : never;
type Success<O> = O extends { responses: infer R }
  ? 200 extends keyof R
    ? JsonContent<R[200]>
    : 201 extends keyof R
      ? JsonContent<R[201]>
      : never
  : never;
type JsonBody<O> = O extends { requestBody?: { content: { "application/json": infer B } } }
  ? B
  : never;
type PathParams<O> = O extends { parameters: { path: infer T } } ? T : never;
type QueryParams<O> = O extends { parameters: { query?: infer T } } ? T : never;

interface CallOptions<O> {
  path?: PathParams<O>;
  query?: QueryParams<O>;
  body?: JsonBody<O>;
  accept?: string;
  signal?: AbortSignal;
}

/**
 * Validate a caller-supplied identifier before it becomes a URL segment:
 * `.` or `..` would be normalized by `new URL` and reach other endpoints.
 */
function pathSegment(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new BackendError("validation_error", "Invalid identifier.");
  }
  return value;
}

const SERVER_ERROR_MESSAGES: Record<number, string> = {
  502: "The language model failed to answer. Try again.",
  504: "The language model took too long to answer. Try again.",
};

/**
 * Typed client of the backend application API (lot 6, ADR 0010).
 *
 * Paths, parameters, bodies and responses come from the generated OpenAPI types,
 * so a contract change breaks the type check. Session calls carry a JWT minted per
 * request; the login bridge carries the `X-Auth-Bridge` secret. Neither credential
 * ever reaches the browser.
 */
export class HttpBackend {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: HttpBackendOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /** Owner-scoped benchmark history. */
  async researchHistory(caller: Caller, sessionId: string) {
    return this.json({ caller }, "get", "/api/v1/sessions/{session_id}/research", {path: {session_id: sessionId}});
  }

  /** Stream the bounded asynchronous research operation. */
  async research(caller: Caller, sessionId: string, signal?: AbortSignal) {
    return this.request({ caller }, "post", "/api/v1/sessions/{session_id}/research", {path: {session_id: sessionId}, signal});
  }

  /** Save explicit feature selection. */
  async selectResearch(caller: Caller, sessionId: string, benchmarkId: string, selectedIds: string[]) {
    return this.json({ caller }, "patch", "/api/v1/sessions/{session_id}/research/{benchmark_id}/selection", {path: {session_id: sessionId, benchmark_id: benchmarkId}, body: {selected_ids: selectedIds}});
  }

  /** Check a password; `null` when the backend rejects the credentials. */
  async verifyCredentials(email: string, password: string): Promise<UserResponse | null> {
    try {
      return await this.json({ bridge: true }, "post", "/api/v1/auth/verify", {
        body: { email, password },
      });
    } catch (error) {
      if (error instanceof BackendError && error.code === "unauthorized") {
        return null;
      }
      throw error;
    }
  }

  /** Resolve or provision the user of OIDC claims verified by Auth.js. */
  async resolveOidcUser(identity: OidcRequest): Promise<UserResponse> {
    return this.json({ bridge: true }, "post", "/api/v1/auth/oidc", { body: identity });
  }

  async listSessions(caller: Caller, options: { includeArchived: boolean }): Promise<SessionPage> {
    return this.json({ caller }, "get", "/api/v1/sessions", {
      query: { include_archived: options.includeArchived, offset: 0, limit: 100 },
    });
  }

  async createSession(caller: Caller, title: string): Promise<CreateSessionResponse> {
    return this.json({ caller }, "post", "/api/v1/sessions", { body: { title } });
  }

  async getSession(caller: Caller, sessionId: string): Promise<SessionOverview> {
    return this.json({ caller }, "get", "/api/v1/sessions/{session_id}", {
      path: { session_id: sessionId },
    });
  }

  async listMessages(caller: Caller, sessionId: string): Promise<ConversationTurn[]> {
    const history = await this.json({ caller }, "get", "/api/v1/sessions/{session_id}/messages", {
      path: { session_id: sessionId },
    });
    return history.items;
  }

  async updateSession(
    caller: Caller,
    sessionId: string,
    patch: SessionPatch,
  ): Promise<SessionOverview> {
    return this.json({ caller }, "patch", "/api/v1/sessions/{session_id}", {
      path: { session_id: sessionId },
      body: patch,
    });
  }

  /**
   * Start a turn. Authorization and pending-review errors arrive before the stream
   * headers and are raised here; runtime failures are a terminal `error` event.
   */
  async streamTurn(
    caller: Caller,
    sessionId: string,
    content: string,
    signal?: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>> {
    let response: Response;
    try {
      response = await this.call({ caller }, "post", "/api/v1/sessions/{session_id}/turns", {
        path: { session_id: sessionId },
        body: { content, modality: "text" },
        accept: "text/event-stream",
        signal,
      });
    } catch (error) {
      // The only conflict raised before the stream starts is a pending human review.
      if (error instanceof BackendError && error.code === "conflict") {
        throw new BackendError("review_pending", error.message);
      }
      throw error;
    }
    if (!response.body) {
      throw new BackendError("backend_unavailable", "The backend returned no event stream.");
    }
    return response.body;
  }

  async listStageDocuments(
    caller: Caller,
    sessionId: string,
    stage: Stage,
  ): Promise<StepDocument[]> {
    return this.json({ caller }, "get", "/api/v1/sessions/{session_id}/stages/{stage}/documents", {
      path: { session_id: sessionId, stage },
    });
  }

  async documentDiff(
    caller: Caller,
    sessionId: string,
    stage: Stage,
    versions: { from: number; to: number },
  ): Promise<DocumentDiff> {
    return this.json(
      { caller },
      "get",
      "/api/v1/sessions/{session_id}/stages/{stage}/documents/diff",
      {
        path: { session_id: sessionId, stage },
        query: { from_version: versions.from, to_version: versions.to },
      },
    );
  }

  async submitReview(
    caller: Caller,
    sessionId: string,
    review: ReviewInput,
  ): Promise<SessionOverview> {
    return this.json({ caller }, "post", "/api/v1/sessions/{session_id}/review", {
      path: { session_id: sessionId },
      body: review,
    });
  }

  async reopenStage(caller: Caller, sessionId: string, stage: Stage): Promise<SessionOverview> {
    return this.json({ caller }, "post", "/api/v1/sessions/{session_id}/stages/{stage}/reopen", {
      path: { session_id: sessionId, stage },
    });
  }

  async editField(
    caller: Caller,
    sessionId: string,
    stage: Stage,
    field: string,
    value: unknown,
  ): Promise<SessionOverview> {
    return this.json(
      { caller },
      "patch",
      "/api/v1/sessions/{session_id}/stages/{stage}/fields/{field}",
      { path: { session_id: sessionId, stage, field }, body: { value } },
    );
  }

  async addComment(
    caller: Caller,
    sessionId: string,
    comment: CommentInput,
  ): Promise<SessionOverview> {
    return this.json({ caller }, "post", "/api/v1/sessions/{session_id}/comments", {
      path: { session_id: sessionId },
      body: comment,
    });
  }

  async exportMarkdown(caller: Caller, sessionId: string): Promise<ExportMarkdownResponse> {
    return this.json({ caller }, "get", "/api/v1/sessions/{session_id}/export/markdown", {
      path: { session_id: sessionId },
    });
  }

  async exportJson(caller: Caller, sessionId: string): Promise<ExportJsonResponse> {
    return this.json({ caller }, "get", "/api/v1/sessions/{session_id}/export/json", {
      path: { session_id: sessionId },
    });
  }

  /** Validated delivery plan with waves; `conflict` while the plan is missing or stale. */
  async exportBacklog(caller: Caller, sessionId: string): Promise<BacklogExport> {
    return this.json({ caller }, "get", "/api/v1/sessions/{session_id}/export/backlog_json", {
      path: { session_id: sessionId },
    });
  }

  async exportSliceSpecs(caller: Caller, sessionId: string): Promise<SliceSpecsExport> {
    return this.json({ caller }, "get", "/api/v1/sessions/{session_id}/export/slice_specs", {
      path: { session_id: sessionId },
    });
  }

  private async json<P extends Path, M extends Method>(
    auth: Auth,
    method: M,
    path: P,
    options: CallOptions<Operation<P, M>> = {},
  ): Promise<Success<Operation<P, M>>> {
    const response = await this.call(auth, method, path, options);
    return (await response.json()) as Success<Operation<P, M>>;
  }

  private async call<P extends Path, M extends Method>(
    auth: Auth,
    method: M,
    path: P,
    options: CallOptions<Operation<P, M>>,
  ): Promise<Response> {
    const params = (options.path ?? {}) as Record<string, unknown>;
    const url = new URL(
      path.replace(/\{(\w+)\}/g, (_match, name: string) => pathSegment(params[name])),
      this.options.baseUrl,
    );
    for (const [key, value] of Object.entries((options.query ?? {}) as Record<string, unknown>)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
    const headers: Record<string, string> = { accept: options.accept ?? "application/json" };
    if (options.body !== undefined) {
      headers["content-type"] = "application/json";
    }
    if ("caller" in auth) {
      headers.authorization = `Bearer ${await signBackendToken(auth.caller.userId, this.options.jwt)}`;
    } else {
      headers["x-auth-bridge"] = this.options.bridgeSecret;
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: method.toUpperCase(),
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        cache: "no-store",
        redirect: "error",
        signal: options.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw error;
      }
      throw new BackendError("backend_unavailable", "The backend is unreachable.");
    }
    if (!response.ok) {
      throw await toError(response);
    }
    return response;
  }
}

/** Convert a backend error response (`{"detail": ...}`) without leaking server internals. */
async function toError(response: Response): Promise<BackendError> {
  const code = codeForStatus(response.status);
  let message =
    SERVER_ERROR_MESSAGES[response.status] ??
    (response.status >= 500
      ? "The backend is unavailable. Try again."
      : `Backend request failed (${response.status}).`);
  if (response.status < 500) {
    try {
      const payload = (await response.json()) as { detail?: unknown };
      if (typeof payload.detail === "string" && payload.detail.length > 0) {
        message = payload.detail;
      } else if (Array.isArray(payload.detail)) {
        message = "The request does not match the backend contract.";
      }
    } catch {
      // Non-JSON error bodies keep the generic message.
    }
  }
  const retryAfter = Number(response.headers.get("retry-after"));
  return new BackendError(code, message, {
    retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
  });
}
