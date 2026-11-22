import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { stage2Session } from "@/test/fixtures";

import {
  canFlush,
  mergeQueue,
  queuedQuestionIds,
  useTurnQueue,
  type QueuedMessage,
} from "./turn-queue";

const queue: QueuedMessage[] = [
  { id: "a", content: "Who?\nFamilies", stage: "stage_2_user_story_mapping", questionId: "q1" },
  { id: "b", content: "And a free note", stage: "stage_2_user_story_mapping" },
];

describe("turn queue", () => {
  it("merges every queued message into one turn", () => {
    expect(mergeQueue(queue)).toBe("Who?\nFamilies\n\nAnd a free note");
    expect(queuedQuestionIds(queue)).toEqual(["q1"]);
  });

  it("flushes only on the stage the messages were written for, when input is accepted", () => {
    expect(canFlush(queue, stage2Session())).toBe(true);
    expect(canFlush([], stage2Session())).toBe(false);
    expect(canFlush(queue, stage2Session({ current_stage: "stage_3_event_storming" }))).toBe(false);
    expect(canFlush(queue, stage2Session({ archived: true }))).toBe(false);
    expect(
      canFlush(
        queue,
        stage2Session({
          pending_human_review: {
            from_stage: "stage_2_user_story_mapping",
            to_stage: "stage_3_event_storming",
            summary: "",
            transition_decision_reason: "",
          },
        }),
      ),
    ).toBe(false);
  });

  it("is readable at once by the running turn", () => {
    const { result } = renderHook(() => useTurnQueue());
    const { peek } = result.current;
    act(() => {
      result.current.add({ content: "One", stage: "stage_0_pitch" });
      result.current.add({ content: "Two", stage: "stage_0_pitch" });
      expect(peek().map((item) => item.content)).toEqual(["One", "Two"]);
    });
    act(() => result.current.remove(result.current.queue[0].id));
    expect(result.current.queue.map((item) => item.content)).toEqual(["Two"]);
    act(() => result.current.clear());
    expect(peek()).toEqual([]);
  });
});
