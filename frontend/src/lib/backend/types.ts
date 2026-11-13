import type { components } from "./generated/api";

/**
 * Provisional application contract between the Next.js server and the backend.
 *
 * Presentation types for the mock workspace (full HTTP mapping is lot 7b).
 * Generated primitives are reused where shapes already match.
 * These types mirror the planned lot 6 API (sessions, typed SSE turn events,
 * reviews, reopen/stale, direct edits, exports). They are hand-written until
 * the OpenAPI-to-TypeScript generation of lot 6 replaces them. Browser code
 * imports them as types only; it never talks to the backend directly.
 */

export const STAGES = [
  "stage_0_pitch",
  "stage_1_problem_framing",
  "stage_2_user_story_mapping",
  "stage_3_event_storming",
  "stage_4_impact_mapping",
  "stage_5_risk_storming",
  "stage_6_backlog_synthesis",
  "stage_7_delivery_slicing",
] as const;

export type StageId = (typeof STAGES)[number];

export const STAGE_LABELS: Record<StageId, string> = {
  stage_0_pitch: "Pitch",
  stage_1_problem_framing: "Problem framing",
  stage_2_user_story_mapping: "User story mapping",
  stage_3_event_storming: "Event storming",
  stage_4_impact_mapping: "Impact mapping",
  stage_5_risk_storming: "Risk storming",
  stage_6_backlog_synthesis: "Backlog synthesis",
  stage_7_delivery_slicing: "Delivery slicing",
};

export function isStageId(value: string): value is StageId {
  return (STAGES as readonly string[]).includes(value);
}

export type StageStatus = "locked" | "active" | "awaiting_review" | "validated" | "stale";

/** A stage can only be reopened once every stage before it is validated. */
export function earlierStagesValidated(
  stages: readonly { stage: StageId; status: StageStatus }[],
  stage: StageId,
): boolean {
  const index = STAGES.indexOf(stage);
  return stages.every(
    (state) => STAGES.indexOf(state.stage) >= index || state.status === "validated",
  );
}

export type Coverage = components["schemas"]["CoverageStatus"];

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
}

export interface FieldCoverage {
  field: string;
  label: string;
  coverage: Coverage;
  value: string | null;
  critical: boolean;
  /** Why the field is only partially covered (proposed by the LLM). */
  reason?: string;
}

export interface ReadinessCheck {
  id: string;
  label: string;
  passed: boolean;
}

export interface StageState {
  stage: StageId;
  status: StageStatus;
  fields: FieldCoverage[];
  readiness: ReadinessCheck[];
  documentVersion: number;
}

export interface AnswerOption {
  id: string;
  label: string;
  recommended: boolean;
}

export interface OpenQuestion {
  id: string;
  stage: StageId;
  question: string;
  whyItMatters: string;
  options: AnswerOption[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  stage: StageId;
  createdAt: string;
}

export interface DocumentVersion {
  stage: StageId;
  version: number;
  createdAt: string;
  markdown: string;
}

export interface SectionComment {
  id: string;
  stage: StageId;
  section: string;
  body: string;
  createdAt: string;
}

export interface PendingReview {
  stage: StageId;
  requestedAt: string;
}

export interface SessionSummary {
  id: string;
  title: string;
  currentStage: StageId;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SessionDetail extends SessionSummary {
  stages: StageState[];
  messages: ChatMessage[];
  openQuestions: OpenQuestion[];
  pendingReview: PendingReview | null;
  comments: SectionComment[];
}

export type ContractKind = "api" | "event" | "data";

export interface Contract {
  id: string;
  name: string;
  kind: ContractKind;
  ownerSliceId: string;
}

export interface Slice {
  id: string;
  name: string;
  goal: string;
  ownedDomain: string;
  backlogItemIds: string[];
  provides: string[];
  consumes: string[];
  dependsOn: string[];
  integrationScenarios: string[];
  stubs: string[];
}

export interface Wave {
  index: number;
  sliceIds: string[];
}

export interface DeliverySlicing {
  slices: Slice[];
  waves: Wave[];
  contracts: Contract[];
}

export const REVIEW_ACTIONS = ["approve", "reject", "request_changes"] as const;
export type ReviewAction = components["schemas"]["ReviewAction"];

export const EXPORT_FORMATS = ["markdown", "json", "slice_specs", "backlog_json"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export interface ExportFile {
  filename: string;
  contentType: string;
  body: string;
}

/** Typed events streamed during one turn (Server-Sent Events, `event:` = type). */
export type TurnEvent =
  | { type: "turn.started"; turnId: string; stage: StageId }
  | { type: "analysis.status"; status: string; message: string }
  | { type: "message.delta"; messageId: string; delta: string }
  | { type: "document.updated"; document: DocumentVersion }
  | { type: "coverage.updated"; stage: StageState }
  | { type: "stage.changed"; from: StageId; to: StageId }
  | { type: "review.required"; review: PendingReview }
  | { type: "questions.updated"; questions: OpenQuestion[] }
  | { type: "turn.completed"; turnId: string; message: ChatMessage }
  | { type: "error"; code: string; message: string };

export type TurnEventType = TurnEvent["type"];

export const TURN_EVENT_TYPES: readonly TurnEventType[] = [
  "turn.started",
  "analysis.status",
  "message.delta",
  "document.updated",
  "coverage.updated",
  "stage.changed",
  "review.required",
  "questions.updated",
  "turn.completed",
  "error",
];

/** Error codes shared by the server proxy and the browser client. */
export type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "review_pending"
  | "rate_limited"
  | "llm_error"
  | "validation_error"
  | "backend_unavailable";

export interface ErrorBody {
  error: { code: ErrorCode; message: string; retryAfterSeconds?: number };
}
