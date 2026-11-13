import { describe, expect, it } from "vitest";

import type { TurnEvent } from "@/lib/backend/types";
import { sessionFixture, stage2Session, stageStateFixture, turnFixture } from "@/test/fixtures";

import { initialWorkspaceState, workspaceReducer, type WorkspaceState } from "./state";

const session = stage2Session();
const history = [
  turnFixture({ id: "m1", role: "user", content: "pitch: meals" }),
  turnFixture({ id: "m2", role: "assistant", content: "Noted." }),
];

function submitted(): WorkspaceState {
  const state = { ...initialWorkspaceState({ session, messages: history }), draft: "Hello" };
  return workspaceReducer(state, {
    type: "turn.submitted",
    message: { id: "local-1", role: "user", content: "Hello" },
  });
}

function apply(state: WorkspaceState, ...events: TurnEvent[]): WorkspaceState {
  return events.reduce(
    (next, event) => workspaceReducer(next, { type: "turn.event", event }),
    state,
  );
}

const completed: TurnEvent = {
  type: "turn.completed",
  turn_id: "t1",
  output: {
    session_id: session.session_id,
    assistant_message: "Hi there",
    current_stage: "stage_2_user_story_mapping",
    processed_stage: "stage_2_user_story_mapping",
    next_stage: null,
    pending_review: null,
    requires_human_review: false,
    stage_clear_enough: false,
    step_markdown: "# Story map",
    summary: "",
    transition_decision_reason: "",
    prompt_tokens: 0,
    completion_tokens: 0,
  },
};

describe("workspaceReducer", () => {
  it("maps the stored conversation to chat messages", () => {
    const state = initialWorkspaceState({ session, messages: history });
    expect(state.messages).toEqual([
      { id: "m1", role: "user", content: "pitch: meals" },
      { id: "m2", role: "assistant", content: "Noted." },
    ]);
  });

  it("accumulates streamed deltas and status, then appends the final message", () => {
    let state = submitted();
    expect(state.draft).toBe("");
    expect(state.messages.at(-1)).toMatchObject({ content: "Hello", local: true });
    state = apply(
      state,
      { type: "turn.started", turn_id: "t1", stage: "stage_2_user_story_mapping" },
      { type: "analysis.status", status: "running" },
      { type: "message.delta", delta: "Hi " },
      { type: "message.delta", delta: "there" },
    );
    expect(state.streaming).toEqual({
      turnId: "t1",
      status: "Analyzing your message…",
      text: "Hi there",
    });

    state = apply(state, completed);
    expect(state.streaming).toBeNull();
    expect(state.messages.at(-1)).toEqual({ id: "t1", role: "assistant", content: "Hi there" });
    expect(state.messages.some((message) => message.local)).toBe(false);
  });

  it("applies document, coverage, stage and review events", () => {
    const coverage = stageStateFixture("stage_2_user_story_mapping", {
      stage_is_clear_enough: true,
      coverage: { mvp_scope: "clear" },
    });
    const state = apply(
      submitted(),
      {
        type: "document.updated",
        document: {
          session_id: session.session_id,
          stage: "stage_2_user_story_mapping",
          version: 3,
          markdown: "# Story map",
          summary: "",
        },
      },
      { type: "coverage.updated", stage: coverage },
      {
        type: "review.required",
        review: {
          from_stage: "stage_2_user_story_mapping",
          to_stage: "stage_3_event_storming",
          summary: "Ready",
          transition_decision_reason: "Gates passed",
        },
      },
      {
        type: "stage.changed",
        from_stage: "stage_2_user_story_mapping",
        to_stage: "stage_3_event_storming",
      },
    );
    expect(state.documentRevision).toBe(1);
    expect(state.streaming?.status).toBe("Updating the stage document…");
    expect(state.session.stage_states?.stage_2_user_story_mapping).toBe(coverage);
    expect(state.session.stage_states?.stage_0_pitch).toBe(session.stage_states?.stage_0_pitch);
    expect(state.session.pending_human_review?.from_stage).toBe("stage_2_user_story_mapping");
    expect(state.session.current_stage).toBe("stage_3_event_storming");
  });

  it("restores the draft and drops the optimistic message when the turn fails", () => {
    const state = apply(
      submitted(),
      { type: "message.delta", delta: "partial" },
      { type: "error", code: "turn_failed", message: "Model failed" },
    );
    expect(state.turnError).toEqual({ code: "llm_error", message: "Model failed" });
    expect(state.draft).toBe("Hello");
    expect(state.streaming).toBeNull();
    expect(state.messages.map((message) => message.id)).toEqual(["m1", "m2"]);
  });

  it("restores the draft when the request itself is refused", () => {
    const state = workspaceReducer(submitted(), {
      type: "turn.failed",
      error: { code: "review_pending", message: "Review first", status: 409 },
    });
    expect(state.turnError?.code).toBe("review_pending");
    expect(state.draft).toBe("Hello");
    expect(state.messages).toHaveLength(2);
  });

  it("reports an interrupted stream without discarding messages", () => {
    const state = workspaceReducer(submitted(), { type: "turn.closed" });
    expect(state.streaming).toBeNull();
    expect(state.turnError?.message).toMatch(/interrupted/);
    expect(state.messages).toHaveLength(3);
  });

  it("replaces the session and bumps the document revision on a reload", () => {
    const reloaded = sessionFixture({ title: "Renamed" });
    const state = workspaceReducer(submitted(), {
      type: "snapshot.loaded",
      snapshot: { session: reloaded, messages: [] },
    });
    expect(state.session.title).toBe("Renamed");
    expect(state.messages).toEqual([]);
    expect(state.documentRevision).toBe(1);
  });
});
