import type { ChatMessage, SessionDetail, TurnEvent } from "@/lib/backend/types";

export interface StreamingTurn {
  turnId: string | null;
  text: string;
  status: string | null;
}

export interface TurnFailure {
  code: string;
  message: string;
  status?: number;
  retryAfterSeconds?: number;
}

export interface WorkspaceState {
  session: SessionDetail;
  streaming: StreamingTurn | null;
  turnError: TurnFailure | null;
  /** Incremented on every `document.updated` so the document panel refetches. */
  documentRevision: number;
  /** Composer text; a failed turn puts its message back here. */
  draft: string;
}

export type WorkspaceAction =
  | { type: "session.replaced"; session: SessionDetail }
  | { type: "turn.submitted"; message: ChatMessage }
  | { type: "turn.event"; event: TurnEvent }
  | { type: "turn.failed"; error: TurnFailure }
  | { type: "turn.closed" }
  | { type: "draft.changed"; draft: string };

export function initialWorkspaceState(session: SessionDetail): WorkspaceState {
  return {
    session,
    streaming: null,
    turnError: null,
    documentRevision: 0,
    draft: "",
  };
}

function withoutLocalMessages(session: SessionDetail): SessionDetail {
  return {
    ...session,
    messages: session.messages.filter((message) => !message.id.startsWith("local-")),
  };
}

function lastLocalMessage(session: SessionDetail): string | null {
  const local = session.messages.filter((message) => message.id.startsWith("local-"));
  return local.at(-1)?.content ?? null;
}

function failTurn(state: WorkspaceState, error: TurnFailure): WorkspaceState {
  return {
    ...state,
    session: withoutLocalMessages(state.session),
    streaming: null,
    turnError: error,
    draft: lastLocalMessage(state.session) ?? state.draft,
  };
}

function applyEvent(state: WorkspaceState, event: TurnEvent): WorkspaceState {
  const { session } = state;
  switch (event.type) {
    case "turn.started":
      return { ...state, streaming: { turnId: event.turnId, text: "", status: null } };
    case "analysis.status":
      return {
        ...state,
        streaming: { turnId: null, text: "", ...state.streaming, status: event.message },
      };
    case "message.delta":
      return {
        ...state,
        streaming: {
          turnId: null,
          status: null,
          ...state.streaming,
          text: (state.streaming?.text ?? "") + event.delta,
        },
      };
    case "document.updated":
      return {
        ...state,
        session: {
          ...session,
          stages: session.stages.map((stage) =>
            stage.stage === event.document.stage
              ? { ...stage, documentVersion: event.document.version }
              : stage,
          ),
        },
        documentRevision: state.documentRevision + 1,
      };
    case "coverage.updated":
      return {
        ...state,
        session: {
          ...session,
          stages: session.stages.map((stage) =>
            stage.stage === event.stage.stage ? event.stage : stage,
          ),
        },
      };
    case "stage.changed":
      return { ...state, session: { ...session, currentStage: event.to } };
    case "review.required":
      return { ...state, session: { ...session, pendingReview: event.review } };
    case "questions.updated":
      return { ...state, session: { ...session, openQuestions: event.questions } };
    case "turn.completed": {
      const confirmed = session.messages.map((message) =>
        message.id.startsWith("local-")
          ? { ...message, id: `user-${message.id.slice(6)}` }
          : message,
      );
      return {
        ...state,
        session: { ...session, messages: [...confirmed, event.message] },
        streaming: null,
      };
    }
    case "error":
      return failTurn(state, { code: event.code, message: event.message });
  }
}

/** Pure reducer applying user actions and streamed turn events to the workspace. */
export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case "session.replaced":
      return { ...state, session: action.session, documentRevision: state.documentRevision + 1 };
    case "turn.submitted":
      return {
        ...state,
        session: { ...state.session, messages: [...state.session.messages, action.message] },
        streaming: { turnId: null, text: "", status: "Sending" },
        turnError: null,
        draft: "",
      };
    case "turn.event":
      return applyEvent(state, action.event);
    case "turn.failed":
      return failTurn(state, action.error);
    case "turn.closed":
      // A stream that ends without `turn.completed` must not leave the UI busy;
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
  }
}
