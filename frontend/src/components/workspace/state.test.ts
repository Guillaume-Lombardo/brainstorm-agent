import { beforeAll, describe, expect, it } from "vitest";

import { demoSession } from "@/test/fixtures";
import type { SessionDetail } from "@/lib/backend/types";

import { initialWorkspaceState, workspaceReducer, type WorkspaceState } from "./state";

let session: SessionDetail;

beforeAll(async () => {
  session = await demoSession("Team retrospective tool");
});

function submitted(): WorkspaceState {
  const state = { ...initialWorkspaceState(session), draft: "Hello" };
  return workspaceReducer(state, {
    type: "turn.submitted",
    message: {
      id: "local-1",
      role: "user",
      content: "Hello",
      stage: session.currentStage,
      createdAt: "2026-11-13T10:00:00Z",
    },
  });
}

describe("workspaceReducer", () => {
  it("accumulates streamed deltas and status, then appends the final message", () => {
    let state = submitted();
    expect(state.draft).toBe("");
    state = workspaceReducer(state, {
      type: "turn.event",
      event: { type: "turn.started", turnId: "t1", stage: session.currentStage },
    });
    state = workspaceReducer(state, {
      type: "turn.event",
      event: { type: "analysis.status", status: "extracting", message: "Extracting" },
    });
    state = workspaceReducer(state, {
      type: "turn.event",
      event: { type: "message.delta", messageId: "a", delta: "Hi " },
    });
    state = workspaceReducer(state, {
      type: "turn.event",
      event: { type: "message.delta", messageId: "a", delta: "there" },
    });
    expect(state.streaming).toEqual({ turnId: "t1", status: "Extracting", text: "Hi there" });

    const reply = {
      id: "a",
      role: "assistant" as const,
      content: "Hi there",
      stage: session.currentStage,
      createdAt: "x",
    };
    state = workspaceReducer(state, {
      type: "turn.event",
      event: { type: "turn.completed", turnId: "t1", message: reply },
    });
    expect(state.streaming).toBeNull();
    expect(state.session.messages.at(-1)).toEqual(reply);
    expect(state.session.messages.some((message) => message.id.startsWith("local-"))).toBe(false);
  });

  it("applies coverage, document, question, stage and review events", () => {
    let state = submitted();
    const stage = { ...state.session.stages[2], status: "awaiting_review" as const };
    state = workspaceReducer(state, {
      type: "turn.event",
      event: { type: "coverage.updated", stage },
    });
    state = workspaceReducer(state, {
      type: "turn.event",
      event: {
        type: "document.updated",
        document: { stage: stage.stage, version: 9, createdAt: "x", markdown: "# x" },
      },
    });
    state = workspaceReducer(state, {
      type: "turn.event",
      event: { type: "questions.updated", questions: [] },
    });
    state = workspaceReducer(state, {
      type: "turn.event",
      event: { type: "review.required", review: { stage: stage.stage, requestedAt: "x" } },
    });
    state = workspaceReducer(state, {
      type: "turn.event",
      event: {
        type: "stage.changed",
        from: "stage_2_user_story_mapping",
        to: "stage_3_event_storming",
      },
    });
    expect(state.session.stages[2]).toMatchObject({
      status: "awaiting_review",
      documentVersion: 9,
    });
    expect(state.documentRevision).toBe(1);
    expect(state.session.openQuestions).toEqual([]);
    expect(state.session.pendingReview?.stage).toBe(stage.stage);
    expect(state.session.currentStage).toBe("stage_3_event_storming");
  });

  it("restores the draft and drops the optimistic message when the turn fails", () => {
    const state = workspaceReducer(submitted(), {
      type: "turn.event",
      event: { type: "error", code: "llm_error", message: "Model failed" },
    });
    expect(state.turnError).toEqual({ code: "llm_error", message: "Model failed" });
    expect(state.draft).toBe("Hello");
    expect(state.streaming).toBeNull();
    expect(state.session.messages).toEqual(session.messages);
  });

  it("reports an interrupted stream without discarding messages", () => {
    const state = workspaceReducer(submitted(), { type: "turn.closed" });
    expect(state.streaming).toBeNull();
    expect(state.turnError?.message).toMatch(/interrupted/);
    expect(state.session.messages).toHaveLength(session.messages.length + 1);
  });
});
