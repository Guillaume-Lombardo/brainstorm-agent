import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { stage2Session } from "@/test/fixtures";

import { acceptsNext, mergeQueue, queuedQuestionIds, useTurnQueue } from "./turn-queue";

describe("turn queue", () => {
  it("merges every queued message into one turn", () => {
    const queue = [
      { id: "a", content: "Who?\nFamilies", questionId: "q1" },
      { id: "b", content: "And a free note" },
    ];
    expect(mergeQueue(queue)).toBe("Who?\nFamilies\n\nAnd a free note");
    expect(queuedQuestionIds(queue)).toEqual(["q1"]);
  });

  it("goes on only when the turn stayed on its stage and input is accepted", () => {
    const stage = "stage_2_user_story_mapping";
    expect(acceptsNext(stage2Session(), stage)).toBe(true);
    expect(acceptsNext(stage2Session({ current_stage: "stage_3_event_storming" }), stage)).toBe(
      false,
    );
    expect(acceptsNext(stage2Session({ archived: true }), stage)).toBe(false);
    const review = {
      from_stage: "stage_2_user_story_mapping" as const,
      to_stage: "stage_3_event_storming" as const,
      summary: "",
      transition_decision_reason: "",
    };
    expect(acceptsNext(stage2Session({ pending_human_review: review }), stage)).toBe(false);
  });

  it("keeps held messages out of the automatic send", () => {
    const { result } = renderHook(() => useTurnQueue());
    const { add, hold, take } = result.current;
    const contents = () => result.current.queue.map((item) => item.content);
    act(() => {
      add({ content: "Kept" });
      hold();
      add({ content: "New" });
      // Read at once, as the running turn does, without waiting for a render.
      expect(take({ held: false }).map((item) => item.content)).toEqual(["New"]);
    });
    expect(contents()).toEqual(["Kept"]);
    act(() => add({ content: "Other" }));
    act(() => result.current.remove(result.current.queue[1].id));
    expect(contents()).toEqual(["Kept"]);
    act(() => {
      expect(take().map((item) => item.content)).toEqual(["Kept"]);
    });
    expect(contents()).toEqual([]);
  });
});
