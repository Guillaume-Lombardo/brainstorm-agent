import type {
  DeliverySlicing,
  DocumentVersion,
  ExportFormat,
  ReviewAction,
  SessionDetail,
  SessionSummary,
  StageId,
  TurnEvent,
} from "@/lib/backend/types";

import { apiErrorFromResponse } from "./errors";
import { parseTurnEvents } from "./sse";

const BASE = "/api/backend/sessions";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }
  return (await response.json()) as T;
}

const sessionPath = (sessionId: string) => `${BASE}/${encodeURIComponent(sessionId)}`;

/** Browser-side client of the Next.js proxy (`/api/backend/*`). */
export const api = {
  listSessions(includeArchived: boolean): Promise<SessionSummary[]> {
    return request(`${BASE}${includeArchived ? "?archived=include" : ""}`);
  },
  createSession(title: string): Promise<SessionSummary> {
    return request(BASE, { method: "POST", body: JSON.stringify({ title }) });
  },
  updateSession(
    sessionId: string,
    patch: { title?: string; archived?: boolean },
  ): Promise<SessionSummary> {
    return request(sessionPath(sessionId), { method: "PATCH", body: JSON.stringify(patch) });
  },
  getSession(sessionId: string): Promise<SessionDetail> {
    return request(sessionPath(sessionId));
  },
  listDocumentVersions(sessionId: string, stage: StageId): Promise<DocumentVersion[]> {
    return request(`${sessionPath(sessionId)}/stages/${stage}/documents`);
  },
  submitReview(
    sessionId: string,
    input: { stage: StageId; action: ReviewAction; note?: string },
  ): Promise<SessionDetail> {
    return request(`${sessionPath(sessionId)}/reviews`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  reopenStage(sessionId: string, stage: StageId): Promise<SessionDetail> {
    return request(`${sessionPath(sessionId)}/stages/${stage}/reopen`, { method: "POST" });
  },
  updateField(
    sessionId: string,
    stage: StageId,
    field: string,
    value: string,
  ): Promise<SessionDetail> {
    return request(
      `${sessionPath(sessionId)}/stages/${stage}/fields/${encodeURIComponent(field)}`,
      { method: "PATCH", body: JSON.stringify({ value }) },
    );
  },
  addComment(
    sessionId: string,
    input: { stage: StageId; section: string; body: string },
  ): Promise<SessionDetail> {
    return request(`${sessionPath(sessionId)}/comments`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  getDeliverySlicing(sessionId: string): Promise<DeliverySlicing> {
    return request(`${sessionPath(sessionId)}/delivery-slicing`);
  },
  exportUrl(sessionId: string, format: ExportFormat): string {
    return `${sessionPath(sessionId)}/export/${format}`;
  },
  /** Send a message and yield the turn's typed events as they arrive. */
  async *sendMessage(
    sessionId: string,
    message: string,
    signal?: AbortSignal,
  ): AsyncGenerator<TurnEvent> {
    const response = await fetch(`${sessionPath(sessionId)}/turns`, {
      method: "POST",
      headers: { accept: "text/event-stream", "content-type": "application/json" },
      body: JSON.stringify({ message }),
      signal,
    });
    if (!response.ok || !response.body) {
      throw await apiErrorFromResponse(response);
    }
    yield* parseTurnEvents(response.body);
  },
};
