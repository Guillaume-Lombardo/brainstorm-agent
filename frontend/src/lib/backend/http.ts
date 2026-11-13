import type { BackendClient, Caller, OidcIdentity } from "./client";
import { BackendError, codeForStatus } from "./errors";
import { signBackendToken, type BackendJwtSettings } from "./jwt";
import type {
  AuthenticatedUser,
  DeliverySlicing,
  DocumentVersion,
  ExportFile,
  ExportFormat,
  ReviewAction,
  SessionDetail,
  SessionSummary,
  StageId,
} from "./types";

export interface HttpBackendOptions {
  /** Backend base URL, e.g. `http://backend:8000`. */
  baseUrl: string;
  jwt: BackendJwtSettings;
  /** Service API key used for the pre-authentication calls (login, OIDC link). */
  serviceApiKey?: string;
  fetchImpl?: typeof fetch;
}

type Auth = { caller: Caller } | { service: true };

/**
 * Backend client over HTTP. Endpoint paths follow the planned lot 6 API and
 * are provisional until the generated OpenAPI types land (lot 7b).
 */
export class HttpBackend implements BackendClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: HttpBackendOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async verifyCredentials(email: string, password: string): Promise<AuthenticatedUser | null> {
    try {
      return await this.json<AuthenticatedUser>({ service: true }, "POST", "/api/v1/auth/login", {
        email,
        password,
      });
    } catch (error) {
      if (error instanceof BackendError && error.status === 401) {
        return null;
      }
      throw error;
    }
  }

  resolveOidcUser(identity: OidcIdentity): Promise<AuthenticatedUser> {
    return this.json({ service: true }, "POST", "/api/v1/auth/oidc", identity);
  }

  listSessions(caller: Caller, options: { includeArchived: boolean }): Promise<SessionSummary[]> {
    const query = options.includeArchived ? "?include_archived=true" : "";
    return this.json({ caller }, "GET", `/api/v1/sessions${query}`);
  }

  createSession(caller: Caller, input: { title: string }): Promise<SessionSummary> {
    return this.json({ caller }, "POST", "/api/v1/sessions", input);
  }

  updateSession(
    caller: Caller,
    sessionId: string,
    patch: { title?: string; archived?: boolean },
  ): Promise<SessionSummary> {
    return this.json({ caller }, "PATCH", this.sessionPath(sessionId), patch);
  }

  getSession(caller: Caller, sessionId: string): Promise<SessionDetail> {
    return this.json({ caller }, "GET", this.sessionPath(sessionId));
  }

  async streamTurn(
    caller: Caller,
    sessionId: string,
    input: { message: string },
    signal?: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>> {
    const response = await this.request(
      { caller },
      "POST",
      `${this.sessionPath(sessionId)}/turns`,
      input,
      { accept: "text/event-stream", signal },
    );
    if (!response.body) {
      throw new BackendError("backend_unavailable", "The backend returned no event stream.");
    }
    return response.body;
  }

  listDocumentVersions(
    caller: Caller,
    sessionId: string,
    stage: StageId,
  ): Promise<DocumentVersion[]> {
    return this.json({ caller }, "GET", `${this.sessionPath(sessionId)}/stages/${stage}/documents`);
  }

  submitReview(
    caller: Caller,
    sessionId: string,
    input: { stage: StageId; action: ReviewAction; note?: string },
  ): Promise<SessionDetail> {
    return this.json({ caller }, "POST", `${this.sessionPath(sessionId)}/reviews`, input);
  }

  reopenStage(caller: Caller, sessionId: string, stage: StageId): Promise<SessionDetail> {
    return this.json({ caller }, "POST", `${this.sessionPath(sessionId)}/stages/${stage}/reopen`);
  }

  updateField(
    caller: Caller,
    sessionId: string,
    stage: StageId,
    field: string,
    value: string,
  ): Promise<SessionDetail> {
    return this.json(
      { caller },
      "PATCH",
      `${this.sessionPath(sessionId)}/stages/${stage}/fields/${encodeURIComponent(field)}`,
      { value },
    );
  }

  addComment(
    caller: Caller,
    sessionId: string,
    input: { stage: StageId; section: string; body: string },
  ): Promise<SessionDetail> {
    return this.json({ caller }, "POST", `${this.sessionPath(sessionId)}/comments`, input);
  }

  getDeliverySlicing(caller: Caller, sessionId: string): Promise<DeliverySlicing> {
    return this.json({ caller }, "GET", `${this.sessionPath(sessionId)}/delivery-slicing`);
  }

  async exportSession(
    caller: Caller,
    sessionId: string,
    format: ExportFormat,
  ): Promise<ExportFile> {
    const response = await this.request(
      { caller },
      "GET",
      `${this.sessionPath(sessionId)}/export/${format}`,
    );
    const disposition = response.headers.get("content-disposition") ?? "";
    const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? `export-${format}`;
    return {
      filename,
      contentType: response.headers.get("content-type") ?? "application/octet-stream",
      body: await response.text(),
    };
  }

  private sessionPath(sessionId: string): string {
    return `/api/v1/sessions/${encodeURIComponent(sessionId)}`;
  }

  private async json<T>(auth: Auth, method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.request(auth, method, path, body);
    return (await response.json()) as T;
  }

  private async request(
    auth: Auth,
    method: string,
    path: string,
    body?: unknown,
    extra: { accept?: string; signal?: AbortSignal } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = { accept: extra.accept ?? "application/json" };
    if (body !== undefined) {
      headers["content-type"] = "application/json";
    }
    if ("caller" in auth) {
      headers.authorization = `Bearer ${await signBackendToken(auth.caller.userId, this.options.jwt)}`;
    } else if (this.options.serviceApiKey) {
      headers["x-api-key"] = this.options.serviceApiKey;
    }

    let response: Response;
    try {
      response = await this.fetchImpl(new URL(path, this.options.baseUrl), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
        signal: extra.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw error;
      }
      throw new BackendError("backend_unavailable", "The backend is unreachable.");
    }
    if (!response.ok) {
      throw await this.toError(response);
    }
    return response;
  }

  private async toError(response: Response): Promise<BackendError> {
    let message = `Backend request failed (${response.status}).`;
    try {
      const payload = (await response.json()) as {
        detail?: unknown;
        error?: { message?: unknown };
      };
      const detail = payload.error?.message ?? payload.detail;
      if (typeof detail === "string" && detail.length > 0) {
        message = detail;
      }
    } catch {
      // Non-JSON error bodies keep the generic message.
    }
    const retryAfter = Number(response.headers.get("retry-after"));
    return new BackendError(codeForStatus(response.status), message, {
      status: response.status >= 500 ? undefined : response.status,
      retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    });
  }
}
