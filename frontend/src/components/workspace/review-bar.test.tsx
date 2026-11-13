import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { stage2Session, stageStateFixture } from "@/test/fixtures";

import { ReviewBar } from "./review-bar";

const pending = stage2Session({
  pending_human_review: {
    from_stage: "stage_2_user_story_mapping",
    to_stage: "stage_3_event_storming",
    summary: "Story map complete.",
    transition_decision_reason: "All gates passed.",
  },
});

describe("ReviewBar", () => {
  it("approves the pending stage", async () => {
    const onReview = vi.fn(async () => undefined);
    render(
      <ReviewBar
        session={pending}
        selected="stage_2_user_story_mapping"
        disabled={false}
        onReview={onReview}
        onReopen={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(onReview).toHaveBeenCalledWith("stage_2_user_story_mapping", "approve");
  });

  it("asks for a note before requesting changes", async () => {
    const onReview = vi.fn(async () => undefined);
    render(
      <ReviewBar
        session={pending}
        selected="stage_2_user_story_mapping"
        disabled={false}
        onReview={onReview}
        onReopen={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Request changes" }));
    await userEvent.type(await screen.findByLabelText("Note"), "Split the backbone");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onReview).toHaveBeenCalledWith(
      "stage_2_user_story_mapping",
      "request_changes",
      "Split the backbone",
    );
  });

  it("rejects with an optional note", async () => {
    const onReview = vi.fn(async () => undefined);
    render(
      <ReviewBar
        session={pending}
        selected="stage_2_user_story_mapping"
        disabled={false}
        onReview={onReview}
        onReopen={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    await userEvent.click(await screen.findByRole("button", { name: "Reject" }));
    expect(onReview).toHaveBeenCalledWith("stage_2_user_story_mapping", "reject", undefined);
  });

  it("offers to reopen a validated earlier stage", async () => {
    const onReopen = vi.fn(async () => undefined);
    render(
      <ReviewBar
        session={stage2Session()}
        selected="stage_1_problem_framing"
        disabled={false}
        onReview={vi.fn()}
        onReopen={onReopen}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Reopen Problem framing" }));
    expect(onReopen).toHaveBeenCalledWith("stage_1_problem_framing");
  });

  it("renders nothing for the active stage without a pending review", () => {
    const { container } = render(
      <ReviewBar
        session={stage2Session()}
        selected="stage_2_user_story_mapping"
        disabled={false}
        onReview={vi.fn()}
        onReopen={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("does not offer to reopen a stage the session never reached", () => {
    const session = stage2Session();
    render(
      <ReviewBar
        session={{
          ...session,
          stage_states: {
            ...session.stage_states,
            stage_5_risk_storming: stageStateFixture("stage_5_risk_storming"),
          },
        }}
        selected="stage_5_risk_storming"
        disabled={false}
        onReview={vi.fn()}
        onReopen={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /^Reopen/ })).not.toBeInTheDocument();
  });
});
