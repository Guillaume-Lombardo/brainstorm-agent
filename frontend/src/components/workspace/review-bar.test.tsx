import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { SessionDetail } from "@/lib/backend/types";
import { demoSession } from "@/test/fixtures";

import { ReviewBar } from "./review-bar";

let session: SessionDetail;

beforeAll(async () => {
  session = await demoSession("Field service scheduling");
});

describe("ReviewBar", () => {
  it("approves the pending stage", async () => {
    const onReview = vi.fn(async () => undefined);
    render(
      <ReviewBar
        pendingReview={session.pendingReview}
        selected={session.stages[7]}
        earlierValidated
        disabled={false}
        onReview={onReview}
        onReopen={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(onReview).toHaveBeenCalledWith("stage_7_delivery_slicing", "approve");
  });

  it("asks for a note before requesting changes", async () => {
    const onReview = vi.fn(async () => undefined);
    render(
      <ReviewBar
        pendingReview={session.pendingReview}
        selected={session.stages[7]}
        earlierValidated
        disabled={false}
        onReview={onReview}
        onReopen={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Request changes" }));
    await userEvent.type(await screen.findByLabelText("Note"), "Split S3");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onReview).toHaveBeenCalledWith(
      "stage_7_delivery_slicing",
      "request_changes",
      "Split S3",
    );
  });

  it("offers to reopen a validated stage", async () => {
    const onReopen = vi.fn(async () => undefined);
    render(
      <ReviewBar
        pendingReview={null}
        selected={session.stages[1]}
        earlierValidated
        disabled={false}
        onReview={vi.fn()}
        onReopen={onReopen}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Reopen Problem framing" }));
    expect(onReopen).toHaveBeenCalledWith("stage_1_problem_framing");
  });

  it("does not offer to reopen a stage while an earlier one is not validated", () => {
    render(
      <ReviewBar
        pendingReview={null}
        selected={{ ...session.stages[1], status: "stale" }}
        earlierValidated={false}
        disabled={false}
        onReview={vi.fn()}
        onReopen={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /^Reopen/ })).not.toBeInTheDocument();
  });
});
