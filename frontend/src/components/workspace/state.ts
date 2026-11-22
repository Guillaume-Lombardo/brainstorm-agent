import type { SessionOverview, SessionSnapshot, TurnEvent } from "@/lib/backend/types";

import { chatMessages, type ChatMessage } from "./view-model";

/** What the running turn is doing, worded by the interface. */
export type TurnStatus = "sending" | "analyzing" | "opening" | "document";

export interface StreamingTurn {
  turnId: string | null;
  /** Tentative reply text (`message.delta`), discarded if the turn fails. */
  text: string;
  status: TurnStatus | null;
  /** The assistant starts the stage by itself: no message was sent. */
  opening?: boolean;
}

export interface TurnFailure {
  code: string;
  message: string;
  status?: number;
  retryAfterSeconds?: number;
}

export interface WorkspaceState {
  session: SessionOverview;
  messages: ChatMessage[];
  streaming: StreamingTurn | null;
  turnError: TurnFailure | null;
  /** Incremented when the stage documents may have changed, so panels refetch. */
  documentRevision: number;
  /** Composer text; a failed turn puts its message back here. */
  draft: string;
}

export type WorkspaceAction =
  | { type: "snapshot.loaded"; snapshot: SessionSnapshot }
  | { type: "session.updated"; session: SessionOverview }
  | { type: "turn.submitted"; message: ChatMessage }
  | { type: "opening.started" }
  | { type: "turn.event"; event: TurnEvent }
  | { type: "turn.failed"; error: TurnFailure }
  | { type: "turn.closed" }
  | { type: "draft.changed"; draft: string }
  | { type: "draft.restored"; content: string };

export function initialWorkspaceState(snapshot: SessionSnapshot): WorkspaceState {
  return {
    session: snapshot.session,
    messages: chatMessages(snapshot.messages),
    streaming: null,
    turnError: null,
    documentRevision: 0,
    draft: "",
  };
}

/** The unsent message comes back before the text typed while its turn ran. */
function restoredDraft(content: string | undefined, draft: string): string {
  return [content, draft].filter(Boolean).join("\n\n");
}

function failTurn(state: WorkspaceState, error: TurnFailure): WorkspaceState {
  const local = state.messages.filter((message) => message.local);
  return {
    ...state,
    messages: state.messages.filter((message) => !message.local),
    streaming: null,
    turnError: error,
    draft: restoredDraft(local.at(-1)?.content, state.draft),
  };
}

function applyEvent(state: WorkspaceState, event: TurnEvent): WorkspaceState {
  const { session } = state;
  const streaming: StreamingTurn = state.streaming ?? { turnId: null, text: "", status: null };
  const working: TurnStatus = streaming.opening ? "opening" : "analyzing";
  switch (event.type) {
    case "turn.started":
      return {
        ...state,
        streaming: { ...streaming, turnId: event.turn_id, text: "", status: working },
      };
    case "analysis.status":
      return { ...state, streaming: { ...streaming, status: working } };
    case "message.delta":
      return { ...state, streaming: { ...streaming, text: streaming.text + event.delta } };
    case "document.updated":
      return {
        ...state,
        streaming: { ...streaming, status: "document" },
        documentRevision: state.documentRevision + 1,
      };
    case "coverage.updated":
      return {
        ...state,
        session: {
          ...session,
          stage_states: { ...session.stage_states, [event.stage.stage]: event.stage },
        },
      };
    case "stage.changed":
      return { ...state, session: { ...session, current_stage: event.to_stage } };
    case "review.required":
      return { ...state, session: { ...session, pending_human_review: event.review } };
    case "turn.completed":
      return {
        ...state,
        messages: [
          ...state.messages.map((message) => ({ ...message, local: undefined })),
          {
            id: event.turn_id,
            role: "assistant",
            content: event.output.assistant_message,
            stage: event.output.processed_stage,
          },
        ],
        streaming: null,
      };
    case "error":
      return failTurn(state, { code: "llm_error", message: event.message });
  }
}

/** Pure reducer applying user actions and streamed turn events to the workspace. */
export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case "snapshot.loaded":
      return {
        ...state,
        session: action.snapshot.session,
        messages: chatMessages(action.snapshot.messages),
        documentRevision: state.documentRevision + 1,
      };
    case "session.updated":
      return { ...state, session: action.session, documentRevision: state.documentRevision + 1 };
    case "turn.submitted":
      return {
        ...state,
        messages: [...state.messages, { ...action.message, local: true }],
        streaming: { turnId: null, text: "", status: "sending" },
        turnError: null,
      };
    case "opening.started":
      return {
        ...state,
        streaming: { turnId: null, text: "", status: "opening", opening: true },
        turnError: null,
      };
    case "turn.event":
      return applyEvent(state, action.event);
    case "turn.failed":
      return failTurn(state, action.error);
    case "turn.closed":
      // A stream that ends without a terminal event must not leave the UI busy;
      // the caller reloads the session to show what the backend kept.
      return state.streaming
        ? {
            ...state,
            streaming: null,
            turnError: {
              code: "backend_unavailable",
              message: "The response was interrupted. The session was reloaded.",
            },
          }
        : state;
    case "draft.changed":
      return { ...state, draft: action.draft };
    case "draft.restored":
      return { ...state, draft: restoredDraft(action.content, state.draft) };
  }
}
