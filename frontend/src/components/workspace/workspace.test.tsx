import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import type { SessionOverview, SessionSnapshot, Stage, TurnEvent } from "@/lib/backend/types";
import { sessionFixture, stageStateFixture, turnFixture } from "@/test/fixtures";

import { Workspace } from "./workspace";

vi.mock("./research-panel", () => ({ ResearchPanel: () => null }));
vi.mock("./document-panel", () => ({ DocumentPanel: () => null }));

const PITCH = "stage_0_pitch";
const PROBLEM = "stage_1_problem_framing";
const pitching = sessionFixture();
const framing = sessionFixture({
  current_stage: PROBLEM,
  stage_states: { stage_0_pitch: stageStateFixture(PITCH, { stage_is_clear_enough: true }) },
});
const opened: SessionOverview = {
  ...framing,
  stage_states: { ...framing.stage_states, [PROBLEM]: stageStateFixture(PROBLEM) },
};

const pitchTurns = [
  turnFixture({ id: "u1", content: "My pitch" }),
  turnFixture({ id: "a1", role: "assistant", content: "Pitch understood" }),
];
const openingTurn = turnFixture({
  id: "a2",
  role: "assistant",
  content: "Prepared proposals",
  stage: PROBLEM,
});

/** Sessions the backend would store, in the order the workspace loads them. */
function stored(...snapshots: SessionSnapshot[]) {
  const load = vi.spyOn(api, "getSession");
  for (const snapshot of snapshots) {
    load.mockResolvedValueOnce(snapshot);
  }
}

async function* turn(stage: Stage, next: Stage, reply: string): AsyncGenerator<TurnEvent> {
  yield { type: "turn.started", turn_id: `t-${stage}-${reply}`, stage };
  yield {
    type: "turn.completed",
    turn_id: `t-${stage}-${reply}`,
    output: {
      session_id: pitching.session_id,
      assistant_message: reply,
      current_stage: next,
      processed_stage: stage,
      next_stage: next === stage ? null : next,
      pending_review: null,
      requires_human_review: false,
      stage_clear_enough: next !== stage,
      step_markdown: "",
      summary: "",
      transition_decision_reason: "",
      prompt_tokens: 0,
      completion_tokens: 0,
    },
  };
}

async function send(message: string, name = "Send") {
  await userEvent.type(await screen.findByLabelText("Message"), message);
  await userEvent.click(screen.getByRole("button", { name }));
}

describe("Workspace stage opening", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("opens the next stage by itself after an automatic transition, once", async () => {
    stored(
      { session: pitching, messages: [] },
      { session: framing, messages: pitchTurns },
      { session: opened, messages: [...pitchTurns, openingTurn] },
    );
    const sendMessage = vi
      .spyOn(api, "sendMessage")
      .mockImplementation(() => turn(PITCH, PROBLEM, "Pitch understood"));
    const openStage = vi
      .spyOn(api, "openStage")
      .mockImplementation(() => turn(PROBLEM, PROBLEM, "Prepared proposals"));
    render(<Workspace sessionId={pitching.session_id} />);
    await send("My pitch");

    expect(await screen.findByText("Prepared proposals")).toBeVisible();
    expect(screen.getByRole("separator", { name: "New stage 1. Problem framing" })).toBeVisible();
    await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeVisible());
    expect(sendMessage).toHaveBeenCalledOnce();
    expect(openStage).toHaveBeenCalledOnce();
    expect(openStage.mock.calls[0][1]).toBe(PROBLEM);
  });

  it("keeps answers queued for the previous stage, and sends those written during the opening", async () => {
    stored(
      { session: pitching, messages: [] },
      { session: framing, messages: pitchTurns },
      { session: opened, messages: [...pitchTurns, openingTurn] },
      { session: opened, messages: [...pitchTurns, openingTurn] },
    );
    const gates: (() => void)[] = [];
    const held = () => new Promise<void>((resolve) => gates.push(resolve));
    const sendMessage = vi
      .spyOn(api, "sendMessage")
      .mockImplementationOnce(async function* () {
        await held();
        yield* turn(PITCH, PROBLEM, "Pitch understood");
      })
      .mockImplementation(() => turn(PROBLEM, PROBLEM, "Noted"));
    vi.spyOn(api, "openStage").mockImplementation(async function* () {
      await held();
      yield* turn(PROBLEM, PROBLEM, "Prepared proposals");
    });
    render(<Workspace sessionId={pitching.session_id} />);
    await send("My pitch");
    await send("About the pitch", "Queue");
    gates[0]();
    expect(await screen.findByText("Preparing the stage…")).toBeVisible();
    await send("About the problem", "Queue");
    gates[1]();

    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2));
    expect(sendMessage.mock.calls[1][1]).toBe("About the problem");
    const waiting = await screen.findByRole("region", { name: "Waiting answers" });
    expect(within(waiting).getByText("About the pitch")).toBeVisible();
  });

  it("does not start a stage when the page loads: the user does", async () => {
    stored(
      { session: framing, messages: pitchTurns },
      { session: opened, messages: [...pitchTurns, openingTurn] },
    );
    const openStage = vi
      .spyOn(api, "openStage")
      .mockImplementation(() => turn(PROBLEM, PROBLEM, "Prepared proposals"));
    render(<Workspace sessionId={pitching.session_id} />);
    const start = await screen.findByRole("button", { name: "Start this stage" });
    expect(openStage).not.toHaveBeenCalled();
    await userEvent.click(start);
    expect(await screen.findByText("Prepared proposals")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Start this stage" })).toBeNull();
  });
});
