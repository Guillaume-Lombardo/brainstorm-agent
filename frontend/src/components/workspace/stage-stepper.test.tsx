import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { stage2Session, stageStateFixture } from "@/test/fixtures";

import { StageDetails } from "./stage-details";
import { StageStepper } from "./stage-stepper";

describe("StageStepper", () => {
  it("lists the eight stages, locks future ones and marks stale stages", async () => {
    const session = stage2Session();
    session.stage_states = {
      ...session.stage_states,
      stage_1_problem_framing: stageStateFixture("stage_1_problem_framing", { stale: true }),
    };
    const onSelect = vi.fn();
    render(<StageStepper session={session} selected={session.current_stage} onSelect={onSelect} />);
    const items = within(screen.getByRole("navigation", { name: "Stages" })).getAllByRole("button");
    expect(items).toHaveLength(8);
    expect(items[7]).toBeDisabled();
    expect(items[2]).toHaveAttribute("aria-current", "step");
    expect(within(items[1]).getByText("stale")).toBeInTheDocument();

    await userEvent.click(items[0]);
    expect(onSelect).toHaveBeenCalledWith("stage_0_pitch");
  });

  it("shows the readiness score of each visited stage", () => {
    const session = stage2Session();
    render(<StageStepper session={session} selected={session.current_stage} onSelect={vi.fn()} />);
    const items = within(screen.getByRole("navigation", { name: "Stages" })).getAllByRole("button");
    expect(items[2]).toHaveTextContent("1/3");
  });
});

describe("StageDetails", () => {
  it("shows readiness, coverage per field and saves an inline list edit", async () => {
    const session = stage2Session();
    const onEditField = vi.fn(async () => true);
    render(
      <StageDetails
        session={session}
        stage="stage_2_user_story_mapping"
        readOnly={false}
        onEditField={onEditField}
      />,
    );
    expect(screen.getByText("Readiness 1/3")).toBeInTheDocument();
    expect(screen.getByText("At least one persona is named.")).toBeInTheDocument();
    const mvp = document.querySelector('[data-field="mvp_scope"]') as HTMLElement;
    expect(within(mvp).getByText("partial")).toBeInTheDocument();
    expect(within(mvp).getByText("Release boundary unclear.")).toBeInTheDocument();
    const personas = document.querySelector('[data-field="actors_personas"]') as HTMLElement;
    expect(within(personas).getByText("missing")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Edit MVP scope" }));
    const editor = screen.getByRole("textbox", { name: "MVP scope value" });
    expect(editor).toHaveValue("Plan a week");
    await userEvent.type(editor, "\nShare the list");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onEditField).toHaveBeenCalledWith("mvp_scope", ["Plan a week", "Share the list"]);
    expect(screen.queryByRole("textbox", { name: "MVP scope value" })).not.toBeInTheDocument();
  });

  it("keeps the editor open when the save fails", async () => {
    const onEditField = vi.fn(async () => false);
    render(
      <StageDetails
        session={stage2Session()}
        stage="stage_2_user_story_mapping"
        readOnly={false}
        onEditField={onEditField}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Edit MVP scope" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("textbox", { name: "MVP scope value" })).toBeInTheDocument();
  });

  it("does not offer edits on an earlier stage: it must be reopened first", () => {
    render(
      <StageDetails
        session={stage2Session()}
        stage="stage_0_pitch"
        readOnly={false}
        onEditField={vi.fn()}
      />,
    );
    expect(screen.getByText("A weekly meal planner that builds the shopping list")).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Edit/ })).not.toBeInTheDocument();
  });

  it("does not offer edits while the workspace is read-only", () => {
    render(
      <StageDetails
        session={stage2Session()}
        stage="stage_2_user_story_mapping"
        readOnly
        onEditField={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /^Edit/ })).not.toBeInTheDocument();
  });

  it("warns that a stale stage must be revalidated", () => {
    const session = stage2Session();
    session.stage_states = {
      ...session.stage_states,
      stage_1_problem_framing: stageStateFixture("stage_1_problem_framing", { stale: true }),
    };
    render(
      <StageDetails
        session={session}
        stage="stage_1_problem_framing"
        readOnly={false}
        onEditField={vi.fn()}
      />,
    );
    expect(screen.getByText(/Revalidate this stage/)).toBeInTheDocument();
  });
});
