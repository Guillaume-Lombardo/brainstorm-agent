import type { components } from "./generated/api";

/**
 * Names for the generated backend contract (`generated/api.ts`, ADR 0010).
 *
 * Every shape exchanged with the backend comes from the OpenAPI snapshot; this module
 * only gives them short names and adds the constants the UI iterates over. The proxy
 * error envelope at the end is the one contract owned by the Next.js server itself.
 * Browser code imports these as types; it never talks to the backend directly.
 */
type Schemas = components["schemas"];

export type Stage = Schemas["Stage"];
export type CoverageStatus = Schemas["CoverageStatus"];
export type SessionOverview = Schemas["SessionOverview"];
export type SessionPage = Schemas["SessionPage"];
export type SessionPatch = Schemas["SessionPatch"];
export type CreateSessionResponse = Schemas["CreateSessionResponse"];
export type StageState = Schemas["StageState"];
export type ReadinessItem = Schemas["ReadinessItem"];
export type OpenQuestionItem = Schemas["OpenQuestionItem"];
export type PendingHumanReview = Schemas["PendingHumanReview"];
export type SectionComment = Schemas["SectionComment"];
export type StepDocument = Schemas["StepDocument"];
export type DocumentDiff = Schemas["DocumentDiff"];
export type ConversationTurn = Schemas["ConversationTurn"];
export type ReviewAction = Schemas["ReviewAction"];
export type ReviewInput = Schemas["ReviewInput"];
export type CommentInput = Schemas["CommentInput"];
export type UserResponse = Schemas["UserResponse"];
export type OidcRequest = Schemas["OIDCRequest"];
export type DeliveryFields = Schemas["DeliveryFields"];
export type DeliverySlice = Schemas["DeliverySlice"];
export type IntegrationScenario = Schemas["IntegrationScenario"];
export type BacklogExport = Schemas["BacklogExport"];
export type SliceSpecsExport = Schemas["SliceSpecsExport"];
export type ExportMarkdownResponse = Schemas["ExportMarkdownResponse"];
export type ExportJsonResponse = Schemas["ExportJsonResponse"];
export type TurnEvent = Schemas["TurnEvent"];
type TurnEventType = TurnEvent["type"];

/** The workflow order; `satisfies` keeps it in sync with the generated enum. */
export const STAGES = [
  "stage_0_pitch",
  "stage_1_problem_framing",
  "stage_2_user_story_mapping",
  "stage_3_event_storming",
  "stage_4_impact_mapping",
  "stage_5_risk_storming",
  "stage_6_backlog_synthesis",
  "stage_7_delivery_slicing",
] as const satisfies readonly Stage[];

export const STAGE_LABELS: Record<Stage, string> = {
  stage_0_pitch: "Pitch",
  stage_1_problem_framing: "Problem framing",
  stage_2_user_story_mapping: "User story mapping",
  stage_3_event_storming: "Event storming",
  stage_4_impact_mapping: "Impact mapping",
  stage_5_risk_storming: "Risk storming",
  stage_6_backlog_synthesis: "Backlog synthesis",
  stage_7_delivery_slicing: "Delivery slicing",
};

export function isStage(value: string): value is Stage {
  return (STAGES as readonly string[]).includes(value);
}

const REVIEW_ACTIONS = [
  "approve",
  "reject",
  "request_changes",
] as const satisfies readonly ReviewAction[];

export function isReviewAction(value: string): value is ReviewAction {
  return (REVIEW_ACTIONS as readonly string[]).includes(value);
}

/** Export endpoints of the backend (`/api/v1/sessions/{id}/export/{format}`). */
const EXPORT_FORMATS = ["markdown", "json", "slice_specs", "backlog_json"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export function isExportFormat(value: string): value is ExportFormat {
  return (EXPORT_FORMATS as readonly string[]).includes(value);
}

/** Every event of the turn stream; `satisfies` rejects a name the contract lacks. */
export const TURN_EVENT_TYPES = [
  "turn.started",
  "analysis.status",
  "message.delta",
  "document.updated",
  "coverage.updated",
  "stage.changed",
  "review.required",
  "turn.completed",
  "error",
] as const satisfies readonly TurnEventType[];

/** Error codes of the Next.js proxy, shared with the browser client. */
export type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "review_pending"
  | "rate_limited"
  | "llm_error"
  | "validation_error"
  | "backend_unavailable";

/** JSON error envelope returned by every `/api/backend/*` route. */
export interface ErrorBody {
  error: { code: ErrorCode; message: string; retryAfterSeconds?: number };
}

/** `GET /api/backend/sessions/{id}`: the session state and its conversation, fetched together. */
export interface SessionSnapshot {
  session: SessionOverview;
  messages: ConversationTurn[];
}
