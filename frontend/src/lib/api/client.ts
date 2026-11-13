import type {
  BacklogExport,
  CreateSessionResponse,
  DocumentDiff,
  ExportFormat,
  ReviewAction,
  SessionOverview,
  SessionPage,
  SessionPatch,
  SessionSnapshot,
  Stage,
  StepDocument,
  TurnEvent,
} from "@/lib/backend/types";

import { apiErrorFromResponse } from "./errors";
import { parseTurnEvents } from "./sse";

const BASE = "/api/backend/sessions";

async function send(path: string, init: RequestInit = {}): Promise<Response> {
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
  return response;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  return (await (await send(path, init)).json()) as T;
}

const sessionPath = (sessionId: string) => `${BASE}/${encodeURIComponent(sessionId)}`;
const stagePath = (sessionId: string, stage: Stage) =>
  `${sessionPath(sessionId)}/stages/${encodeURIComponent(stage)}`;

/** Browser-side client of the Next.js proxy (`/api/backend/*`). */
export const api = {
  listSessions(includeArchived: boolean): Promise<SessionPage> {
    return request(`${BASE}${includeArchived ? "?archived=include" : ""}`);
  },
  createSession(title: string): Promise<CreateSessionResponse> {
    return request(BASE, { method: "POST", body: JSON.stringify({ title }) });
  },
  updateSession(sessionId: string, patch: SessionPatch): Promise<SessionOverview> {
    return request(sessionPath(sessionId), { method: "PATCH", body: JSON.stringify(patch) });
  },
  getSession(sessionId: string): Promise<SessionSnapshot> {
    return request(sessionPath(sessionId));
  },
  listDocuments(sessionId: string, stage: Stage): Promise<StepDocument[]> {
    return request(`${stagePath(sessionId, stage)}/documents`);
  },
  documentDiff(sessionId: string, stage: Stage, from: number, to: number): Promise<DocumentDiff> {
    return request(`${stagePath(sessionId, stage)}/documents/diff?from=${from}&to=${to}`);
  },
  submitReview(
    sessionId: string,
    input: { stage: Stage; action: ReviewAction; note?: string },
  ): Promise<SessionOverview> {
    return request(`${sessionPath(sessionId)}/review`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  reopenStage(sessionId: string, stage: Stage): Promise<SessionOverview> {
    return request(`${stagePath(sessionId, stage)}/reopen`, { method: "POST" });
  },
  editField(
    sessionId: string,
    stage: Stage,
    field: string,
    value: unknown,
  ): Promise<SessionOverview> {
    return request(`${stagePath(sessionId, stage)}/fields/${encodeURIComponent(field)}`, {
      method: "PATCH",
      body: JSON.stringify({ value }),
    });
  },
  addComment(
    sessionId: string,
    input: { stage: Stage; section: string; body: string },
  ): Promise<SessionOverview> {
    return request(`${sessionPath(sessionId)}/comments`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  getDeliveryPlan(sessionId: string): Promise<BacklogExport> {
    return request(`${sessionPath(sessionId)}/delivery-plan`);
  },
  /** Fetch an export; errors (409 for an unready delivery plan) become `ApiError`s. */
  async downloadExport(
    sessionId: string,
    format: ExportFormat,
  ): Promise<{ blob: Blob; filename: string }> {
    const response = await send(`${sessionPath(sessionId)}/export/${format}`);
    const disposition = response.headers.get("content-disposition") ?? "";
    const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `export-${format}`;
    return { blob: await response.blob(), filename };
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
