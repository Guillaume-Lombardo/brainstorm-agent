import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { SessionDetail } from "@/lib/backend/types";
import { demoSession } from "@/test/fixtures";

import { StageDetails } from "./stage-details";
import { StageStepper } from "./stage-stepper";

let session: SessionDetail;

beforeAll(async () => {
  session = await demoSession("Team retrospective tool");
});

describe("StageStepper", () => {
  it("lists the eight stages, locks future ones and marks stale stages", async () => {
    const stages = session.stages.map((stage, index) =>
      index === 1 ? { ...stage, status: "stale" as const } : stage,
    );
    const onSelect = vi.fn();
    render(
      <StageStepper
        stages={stages}
        currentStage={session.currentStage}
        selected={session.currentStage}
        onSelect={onSelect}
      />,
    );
    const items = within(screen.getByRole("navigation", { name: "Stages" })).getAllByRole("button");
    expect(items).toHaveLength(8);
    expect(items[7]).toBeDisabled();
    expect(items[2]).toHaveAttribute("aria-current", "step");
    expect(within(items[1]).getByText("stale")).toBeInTheDocument();

    await userEvent.click(items[0]);
    expect(onSelect).toHaveBeenCalledWith("stage_0_pitch");
  });
});

describe("StageDetails", () => {
  it("shows readiness, coverage per field and saves an inline edit", async () => {
    const stage = session.stages[2];
    const onEditField = vi.fn(async () => true);
    render(<StageDetails stage={stage} readOnly={false} onEditField={onEditField} />);
    expect(screen.getByText("Readiness 0/3")).toBeInTheDocument();
    expect(screen.getByText("partial")).toBeInTheDocument();
    expect(screen.getByText("missing")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Edit MVP scope" }));
    await userEvent.type(screen.getByRole("textbox", { name: "MVP scope value" }), "Vote");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onEditField).toHaveBeenCalledWith("mvp_scope", "Vote");
    expect(screen.queryByRole("textbox", { name: "MVP scope value" })).not.toBeInTheDocument();
  });

  it("does not offer edits on a validated stage", () => {
    render(<StageDetails stage={session.stages[0]} readOnly={false} onEditField={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /^Edit/ })).not.toBeInTheDocument();
  });

  it("does not offer edits while the workspace is read-only", () => {
    render(<StageDetails stage={session.stages[2]} readOnly onEditField={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /^Edit/ })).not.toBeInTheDocument();
  });
});
