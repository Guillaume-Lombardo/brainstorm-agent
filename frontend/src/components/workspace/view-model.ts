import {
  STAGE_FIELDS,
  type StageFieldKind,
  type StageFieldSpec,
} from "@/lib/backend/generated/stage-fields";
import {
  STAGES,
  type ConversationTurn,
  type CoverageStatus,
  type DeliverySlice,
  type OpenQuestionItem,
  type SessionOverview,
  type Stage,
  type StageState,
} from "@/lib/backend/types";

/**
 * Presentation derived from the backend session state. Nothing here is a contract:
 * every input is a generated type and every rule mirrors what the backend decided
 * (completion, review, staleness); the UI never re-validates a stage.
 */

export type StageStatus = "locked" | "active" | "awaiting_review" | "validated" | "stale";

export function stageState(session: SessionOverview, stage: Stage): StageState | undefined {
  return session.stage_states?.[stage];
}

/** Status shown in the stepper, from the backend's current stage, review and stale markers. */
export function stageStatus(session: SessionOverview, stage: Stage): StageStatus {
  const state = stageState(session, stage);
  if (state?.stale) {
    return "stale";
  }
  if (session.pending_human_review?.from_stage === stage) {
    return "awaiting_review";
  }
  if (stage === session.current_stage) {
    return "active";
  }
  if (state && STAGES.indexOf(stage) < STAGES.indexOf(session.current_stage)) {
    return "validated";
  }
  return "locked";
}

/** The backend reopens only earlier stages it has visited. */
export function canReopen(session: SessionOverview, stage: Stage): boolean {
  return (
    stageState(session, stage) !== undefined &&
    STAGES.indexOf(stage) < STAGES.indexOf(session.current_stage)
  );
}

export interface FieldView extends StageFieldSpec {
  /** `null` for optional fields the gate does not score. */
  coverage: CoverageStatus | null;
  /** Raw typed value of the stage contract. */
  value: unknown;
  /** Display lines; empty when the field is not provided yet. */
  lines: string[];
  /** Why the analysis considers the field only partially covered. */
  reason?: string;
}

function itemLabel(item: unknown): string {
  if (typeof item !== "object" || item === null) {
    return String(item);
  }
  const record = item as Record<string, unknown>;
  const text = [record.statement, record.goal, record.description].find(
    (candidate): candidate is string => typeof candidate === "string" && candidate.length > 0,
  );
  const prefix = [record.category, record.id].find(
    (candidate): candidate is string => typeof candidate === "string" && candidate.length > 0,
  );
  return [prefix, text].filter(Boolean).join(": ") || JSON.stringify(item);
}

/** Display lines of a field value, whatever its contract kind. */
export function fieldLines(value: unknown): string[] {
  if (value === null || value === undefined || value === "") {
    return [];
  }
  if (typeof value === "boolean") {
    return [value ? "Yes" : "No"];
  }
  if (Array.isArray(value)) {
    return value.map(itemLabel);
  }
  return [itemLabel(value)];
}

/** Fields of a stage in contract order, with coverage and partial-coverage reasons. */
export function stageFields(session: SessionOverview, stage: Stage): FieldView[] {
  const state = stageState(session, stage);
  const values = (state?.extracted_fields ?? {}) as Record<string, unknown>;
  return STAGE_FIELDS[stage].map((spec) => {
    const value = values[spec.name] ?? null;
    return {
      ...spec,
      coverage: state?.coverage?.[spec.name] ?? (spec.required ? "missing" : null),
      value,
      lines: fieldLines(value),
      reason: state?.partial_fields?.[spec.name],
    };
  });
}

/** Inline-editable kinds; structured items (risks, stories, slices) change through the conversation. */
export function isEditable(kind: StageFieldKind): boolean {
  return kind !== "structured";
}

/** Text shown in the inline editor (one list item per line). */
export function draftFromValue(kind: StageFieldKind, value: unknown): string {
  if (kind === "list" && Array.isArray(value)) {
    return value.map(String).join("\n");
  }
  if (kind === "boolean") {
    return value === true ? "true" : value === false ? "false" : "";
  }
  return typeof value === "string" ? value : "";
}

/** Typed JSON value sent to `PATCH .../fields/{field}`; empty clears the field. */
export function valueFromDraft(kind: StageFieldKind, draft: string): unknown {
  const text = draft.trim();
  switch (kind) {
    case "list": {
      const items = draft
        .split("\n")
        .map((line) => line.replace(/^\s*[-*]\s+/, "").trim())
        .filter(Boolean);
      return items.length > 0 ? items : null;
    }
    case "boolean":
      return text === "true" ? true : text === "false" ? false : null;
    default:
      return text.length > 0 ? text : null;
  }
}

/** Question budget and topic order of the backend (`core/elicitation.py`, ADR 0007). */
const QUESTION_BUDGET = 3;
const QUESTION_PRIORITIES: OpenQuestionItem["priority"][] = [
  "scope",
  "security/compliance",
  "ux",
  "technical",
];

/**
 * Open questions of the current stage as the backend presents them: every question persists,
 * but only the first three by topic priority are asked.
 */
export function currentQuestions(session: SessionOverview): OpenQuestionItem[] {
  const state = stageState(session, session.current_stage);
  const rank = (question: OpenQuestionItem) =>
    QUESTION_PRIORITIES.indexOf(question.priority ?? "scope");
  return (state?.open_questions ?? [])
    .filter((question) => question.status !== "resolved")
    .sort((left, right) => rank(left) - rank(right))
    .slice(0, QUESTION_BUDGET);
}

/** The message sent when the user picks an answer option. */
export function answerMessage(question: OpenQuestionItem, option: string): string {
  return `${question.question}\n${option}`;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Sent by this browser and not yet confirmed by `turn.completed`. */
  local?: boolean;
}

export function chatMessages(turns: ConversationTurn[]): ChatMessage[] {
  return turns.map((turn, index) => ({
    id: turn.id ?? `turn-${index}`,
    role: turn.role,
    content: turn.content,
  }));
}

/** Slices of stage 7 as last analysed (draft until the plan passes its checks). */
export function deliverySlices(session: SessionOverview): DeliverySlice[] {
  const fields = stageState(session, "stage_7_delivery_slicing")?.extracted_fields as
    { slices?: DeliverySlice[] | null } | undefined;
  return fields?.slices ?? [];
}

export interface ContractRow {
  id: string;
  specification: string;
  owner: string;
  consumers: string[];
}

/** Contracts × slices: provider (owner) and consumers of every contract. */
export function contractMatrix(slices: DeliverySlice[]): ContractRow[] {
  return slices.flatMap((slice) =>
    (slice.provided_contracts ?? []).map((contract) => ({
      id: contract.id,
      specification: contract.specification,
      owner: slice.id,
      consumers: slices
        .filter((other) => (other.consumed_contracts ?? []).includes(contract.id))
        .map((other) => other.id),
    })),
  );
}
