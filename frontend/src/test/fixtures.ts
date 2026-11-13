import { STAGE_FIELDS } from "@/lib/backend/generated/stage-fields";
import type {
  ConversationTurn,
  DeliverySlice,
  OpenQuestionItem,
  SessionOverview,
  Stage,
  StageState,
} from "@/lib/backend/types";

/**
 * Builders of backend payloads for component tests. Every value is typed against the
 * generated contract (`generated/api.ts`), so a backend schema change breaks the tests
 * at compile time instead of drifting silently.
 */

const NOW = "2026-11-13T09:00:00Z";

/** Extracted fields of a stage: every contract field `null` except the given values. */
export function fieldsFixture(
  stage: Stage,
  values: Record<string, unknown>,
): NonNullable<StageState["extracted_fields"]> {
  const empty = Object.fromEntries(STAGE_FIELDS[stage].map((field) => [field.name, null]));
  return { ...empty, ...values } as NonNullable<StageState["extracted_fields"]>;
}

export function stageStateFixture(stage: Stage, overrides: Partial<StageState> = {}): StageState {
  return {
    stage,
    assistant_message: "",
    latest_markdown: "",
    summary: "",
    stage_is_clear_enough: false,
    stale: false,
    transition_decision_reason: "",
    coverage: {},
    readiness: [],
    open_questions: [],
    ...overrides,
  };
}

export function sessionFixture(overrides: Partial<SessionOverview> = {}): SessionOverview {
  return {
    session_id: "11111111-2222-3333-4444-555555555555",
    title: "Meal planner",
    archived: false,
    created_at: NOW,
    updated_at: NOW,
    current_stage: "stage_0_pitch",
    completed_stages: [],
    stage_states: {},
    comments: [],
    open_questions: [],
    pending_human_review: null,
    ...overrides,
  };
}

/** A session on stage 2 with stages 0 and 1 validated and a partially covered stage 2. */
export function stage2Session(overrides: Partial<SessionOverview> = {}): SessionOverview {
  return sessionFixture({
    current_stage: "stage_2_user_story_mapping",
    completed_stages: ["stage_0_pitch", "stage_1_problem_framing"],
    stage_states: {
      stage_0_pitch: stageStateFixture("stage_0_pitch", {
        stage_is_clear_enough: true,
        coverage: { pitch_summary: "clear" },
        extracted_fields: fieldsFixture("stage_0_pitch", {
          pitch_summary: "A weekly meal planner that builds the shopping list",
        }),
      }),
      stage_1_problem_framing: stageStateFixture("stage_1_problem_framing", {
        stage_is_clear_enough: true,
      }),
      stage_2_user_story_mapping: stageStateFixture("stage_2_user_story_mapping", {
        summary: "Story map under construction.",
        coverage: { mvp_scope: "partial", actors_personas: "missing" },
        partial_fields: { mvp_scope: "Release boundary unclear." },
        extracted_fields: fieldsFixture("stage_2_user_story_mapping", {
          mvp_scope: ["Plan a week"],
        }),
        readiness: [
          { id: "personas", message: "At least one persona is named.", passed: false },
          { id: "backbone", message: "The backbone has activities.", passed: false },
          { id: "mvp", message: "The MVP scope is explicit.", passed: true },
        ],
      }),
    },
    ...overrides,
  });
}

export function questionFixture(overrides: Partial<OpenQuestionItem> = {}): OpenQuestionItem {
  return {
    id: "q1",
    question: "Must the plan handle a household budget?",
    why_it_matters: "It changes the data model.",
    options: ["Yes", "No"],
    recommended_option: "Yes",
    blocking: true,
    priority: "scope",
    status: "open",
    ...overrides,
  };
}

export function turnFixture(overrides: Partial<ConversationTurn> = {}): ConversationTurn {
  return {
    id: "turn-1",
    session_id: "11111111-2222-3333-4444-555555555555",
    stage: "stage_0_pitch",
    role: "user",
    content: "pitch: A weekly meal planner",
    modality: "text",
    prompt_tokens: 0,
    completion_tokens: 0,
    created_at: NOW,
    ...overrides,
  };
}

/** Three slices: S1 provides C1, S2 consumes it, S3 depends on both. */
export const SLICES: DeliverySlice[] = [
  {
    id: "S1",
    goal: "Walking skeleton",
    owned_domain: ["planning"],
    backlog_item_ids: ["B1"],
    provided_contracts: [{ id: "C1", specification: "Plan API" }],
    integration_scenarios: [
      {
        ears: "WHEN a week is planned THE SYSTEM SHALL store it",
        given: "",
        when: "",
        then: "",
      },
    ],
  },
  {
    id: "S2",
    goal: "Shopping list",
    owned_domain: ["shopping"],
    consumed_contracts: ["C1"],
    dependencies: ["S1"],
    stubs: ["Plan API stub"],
    integration_scenarios: [
      { ears: null, given: "a planned week", when: "the list is built", then: "items are grouped" },
    ],
  },
  { id: "S3", goal: "Budget view", dependencies: ["S1", "S2"] },
];
