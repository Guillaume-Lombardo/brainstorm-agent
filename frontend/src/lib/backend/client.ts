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

/** Identity forwarded to the backend (`sub` of the short-lived JWT). */
export interface Caller {
  userId: string;
}

export interface OidcIdentity {
  issuer: string;
  subject: string;
  email: string | null;
  name: string | null;
}

/**
 * Every operation the Next.js server performs against the backend.
 *
 * Implementations: `MockBackend` (in-memory, `BACKEND_MODE=mock`) and
 * `HttpBackend` (real API, `BACKEND_MODE=http`). Errors are `BackendError`.
 */
export interface BackendClient {
  verifyCredentials(email: string, password: string): Promise<AuthenticatedUser | null>;
  resolveOidcUser(identity: OidcIdentity): Promise<AuthenticatedUser>;

  listSessions(caller: Caller, options: { includeArchived: boolean }): Promise<SessionSummary[]>;
  createSession(caller: Caller, input: { title: string }): Promise<SessionSummary>;
  updateSession(
    caller: Caller,
    sessionId: string,
    patch: { title?: string; archived?: boolean },
  ): Promise<SessionSummary>;
  getSession(caller: Caller, sessionId: string): Promise<SessionDetail>;

  /**
   * Start a turn. Resolves once the backend accepted it (errors such as 409 are
   * raised here) with the Server-Sent Events byte stream of `TurnEvent`s.
   */
  streamTurn(
    caller: Caller,
    sessionId: string,
    input: { message: string },
    signal?: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>>;

  listDocumentVersions(
    caller: Caller,
    sessionId: string,
    stage: StageId,
  ): Promise<DocumentVersion[]>;
  submitReview(
    caller: Caller,
    sessionId: string,
    input: { stage: StageId; action: ReviewAction; note?: string },
  ): Promise<SessionDetail>;
  reopenStage(caller: Caller, sessionId: string, stage: StageId): Promise<SessionDetail>;
  updateField(
    caller: Caller,
    sessionId: string,
    stage: StageId,
    field: string,
    value: string,
  ): Promise<SessionDetail>;
  addComment(
    caller: Caller,
    sessionId: string,
    input: { stage: StageId; section: string; body: string },
  ): Promise<SessionDetail>;
  getDeliverySlicing(caller: Caller, sessionId: string): Promise<DeliverySlicing>;
  exportSession(caller: Caller, sessionId: string, format: ExportFormat): Promise<ExportFile>;
}
