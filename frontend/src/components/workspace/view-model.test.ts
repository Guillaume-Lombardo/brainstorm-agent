import { describe, expect, it } from "vitest";

import {
  SLICES,
  fieldsFixture,
  questionFixture,
  sessionFixture,
  stage2Session,
  stageStateFixture,
} from "@/test/fixtures";

import {
  answerMessage,
  canReopen,
  contractMatrix,
  currentQuestions,
  deliverySlices,
  draftFromValue,
  fieldLines,
  stageFields,
  stageStatus,
  valueFromDraft,
} from "./view-model";

describe("stageStatus", () => {
  it("derives the stepper status from the backend state", () => {
    const session = stage2Session({
      pending_human_review: {
        from_stage: "stage_2_user_story_mapping",
        to_stage: "stage_3_event_storming",
        summary: "",
        transition_decision_reason: "",
      },
    });
    expect(stageStatus(session, "stage_0_pitch")).toBe("validated");
    expect(stageStatus(session, "stage_2_user_story_mapping")).toBe("awaiting_review");
    expect(stageStatus(session, "stage_3_event_storming")).toBe("locked");
    expect(stageStatus(stage2Session(), "stage_2_user_story_mapping")).toBe("active");
  });

  it("puts the stale marker before any other status", () => {
    const session = stage2Session();
    session.stage_states!.stage_1_problem_framing = stageStateFixture("stage_1_problem_framing", {
      stale: true,
    });
    expect(stageStatus(session, "stage_1_problem_framing")).toBe("stale");
  });
});

describe("canReopen", () => {
  it("allows visited earlier stages only", () => {
    const session = stage2Session();
    expect(canReopen(session, "stage_1_problem_framing")).toBe(true);
    expect(canReopen(session, "stage_2_user_story_mapping")).toBe(false);
    expect(canReopen(sessionFixture(), "stage_0_pitch")).toBe(false);
  });
});

describe("stageFields", () => {
  it("lists the contract fields in order with coverage and reasons", () => {
    const fields = stageFields(stage2Session(), "stage_2_user_story_mapping");
    expect(fields.map((field) => field.name)).toEqual([
      "actors_personas",
      "user_journeys",
      "capabilities",
      "mvp_scope",
      "dependencies",
      "functional_gaps",
      "edge_cases",
    ]);
    const mvp = fields.find((field) => field.name === "mvp_scope");
    expect(mvp).toMatchObject({
      kind: "list",
      coverage: "partial",
      lines: ["Plan a week"],
      reason: "Release boundary unclear.",
    });
    // Required fields the analysis has not scored yet are shown as missing.
    expect(fields.find((field) => field.name === "user_journeys")?.coverage).toBe("missing");
  });

  it("labels structured items by id and statement", () => {
    expect(fieldLines([{ id: "R1", statement: "Supplier API changes" }])).toEqual([
      "R1: Supplier API changes",
    ]);
    expect(fieldLines(true)).toEqual(["Yes"]);
    expect(fieldLines(null)).toEqual([]);
  });
});

describe("inline edit drafts", () => {
  it("round-trips list, boolean and text values", () => {
    expect(draftFromValue("list", ["a", "b"])).toBe("a\nb");
    expect(valueFromDraft("list", "- a\n\n* b\n")).toEqual(["a", "b"]);
    expect(valueFromDraft("list", "  ")).toBeNull();
    expect(draftFromValue("boolean", false)).toBe("false");
    expect(valueFromDraft("boolean", "true")).toBe(true);
    expect(valueFromDraft("boolean", "")).toBeNull();
    expect(valueFromDraft("text", "  Pitch  ")).toBe("Pitch");
    expect(valueFromDraft("text", "")).toBeNull();
  });
});

describe("currentQuestions", () => {
  it("returns the unresolved questions of the current stage", () => {
    const open = questionFixture({ id: "open" });
    const session = stage2Session();
    session.stage_states!.stage_2_user_story_mapping = stageStateFixture(
      "stage_2_user_story_mapping",
      { open_questions: [open, questionFixture({ id: "done", status: "resolved" })] },
    );
    expect(currentQuestions(session)).toEqual([open]);
    expect(answerMessage(open, "Yes")).toBe("Must the plan handle a household budget?\nYes");
  });

  it("shows the backend selection: at most three, by scope, security, UX, technical", () => {
    const technical = questionFixture({ id: "technical", priority: "technical" });
    const ux = questionFixture({ id: "ux", priority: "ux" });
    const scope = questionFixture({ id: "scope", priority: "scope" });
    const security = questionFixture({ id: "security", priority: "security/compliance" });
    const gate = questionFixture({ id: "gate", priority: "scope" });
    const session = stage2Session();
    session.stage_states!.stage_2_user_story_mapping = stageStateFixture(
      "stage_2_user_story_mapping",
      { open_questions: [technical, ux, scope, security, gate] },
    );
    expect(currentQuestions(session).map((question) => question.id)).toEqual([
      "scope",
      "gate",
      "security",
    ]);
  });
});

describe("delivery slicing", () => {
  it("reads the slices of stage 7 and builds the contract matrix", () => {
    const session = sessionFixture({
      current_stage: "stage_7_delivery_slicing",
      stage_states: {
        stage_7_delivery_slicing: stageStateFixture("stage_7_delivery_slicing", {
          extracted_fields: fieldsFixture("stage_7_delivery_slicing", { slices: SLICES }),
        }),
      },
    });
    expect(deliverySlices(session).map((slice) => slice.id)).toEqual(["S1", "S2", "S3"]);
    expect(deliverySlices(sessionFixture())).toEqual([]);
    expect(contractMatrix(SLICES)).toEqual([
      { id: "C1", specification: "Plan API", owner: "S1", consumers: ["S2"] },
    ]);
  });
});
