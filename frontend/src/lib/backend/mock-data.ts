import type { DeliverySlicing, StageId } from "./types";

/**
 * Provisional per-stage field lists used by the mock backend only. The real
 * stage contracts come from the backend (lot 1 typed stage models).
 */
export interface MockFieldDefinition {
  field: string;
  label: string;
  critical: boolean;
}

export const MOCK_STAGE_FIELDS: Record<StageId, MockFieldDefinition[]> = {
  stage_0_pitch: [
    { field: "product_idea", label: "Product idea", critical: true },
    { field: "target_users", label: "Target users", critical: true },
    { field: "expected_value", label: "Expected value", critical: false },
  ],
  stage_1_problem_framing: [
    { field: "problem_statement", label: "Problem statement", critical: true },
    { field: "context_5w1h", label: "Context (5W1H)", critical: false },
    {
      field: "measurable_objectives",
      label: "Measurable objectives",
      critical: true,
    },
  ],
  stage_2_user_story_mapping: [
    { field: "actors", label: "Actors", critical: false },
    {
      field: "backbone_activities",
      label: "Backbone activities",
      critical: true,
    },
    { field: "mvp_scope", label: "MVP scope", critical: true },
  ],
  stage_3_event_storming: [
    { field: "relevance", label: "Relevance", critical: true },
    { field: "domain_events", label: "Domain events", critical: false },
    { field: "aggregates", label: "Aggregates", critical: false },
  ],
  stage_4_impact_mapping: [
    { field: "goal", label: "Goal", critical: true },
    { field: "actor_impacts", label: "Actor impacts", critical: false },
    { field: "deliverables", label: "Deliverables", critical: false },
  ],
  stage_5_risk_storming: [
    { field: "risks", label: "Risks", critical: true },
    { field: "mitigations", label: "Mitigations", critical: true },
    { field: "pre_mortem", label: "Pre-mortem", critical: false },
  ],
  stage_6_backlog_synthesis: [
    { field: "backlog_items", label: "Backlog items", critical: true },
    { field: "definition_of_done", label: "Definition of done", critical: false },
    { field: "traceability", label: "Traceability links", critical: false },
  ],
  stage_7_delivery_slicing: [
    { field: "slices", label: "Slices", critical: true },
    { field: "contracts", label: "Contracts", critical: true },
    { field: "waves", label: "Delivery waves", critical: false },
  ],
};

export const DEMO_DELIVERY_SLICING: DeliverySlicing = {
  slices: [
    {
      id: "S0",
      name: "Walking skeleton",
      goal: "Deployable shell with shared contracts and the job data model.",
      ownedDomain: "Platform",
      backlogItemIds: ["B1", "B2"],
      provides: ["C1", "C2", "C3"],
      consumes: [],
      dependsOn: [],
      integrationScenarios: [
        "GIVEN an empty system WHEN a health probe runs THEN every service answers ready",
      ],
      stubs: [],
    },
    {
      id: "S1",
      name: "Job intake",
      goal: "Dispatchers create and qualify service jobs.",
      ownedDomain: "Jobs",
      backlogItemIds: ["B3", "B4"],
      provides: ["C4"],
      consumes: ["C1", "C3"],
      dependsOn: ["S0"],
      integrationScenarios: [
        "GIVEN a dispatcher WHEN they submit a job THEN a JobCreated event is published",
      ],
      stubs: ["Availability feed stub"],
    },
    {
      id: "S2",
      name: "Technician availability",
      goal: "Technicians declare availability windows and skills.",
      ownedDomain: "Workforce",
      backlogItemIds: ["B5"],
      provides: ["C5"],
      consumes: ["C1"],
      dependsOn: ["S0"],
      integrationScenarios: [
        "GIVEN a technician WHEN they set a window THEN AvailabilityChanged is emitted",
      ],
      stubs: [],
    },
    {
      id: "S3",
      name: "Dispatch board",
      goal: "Match qualified jobs with available technicians.",
      ownedDomain: "Scheduling",
      backlogItemIds: ["B6", "B7"],
      provides: [],
      consumes: ["C2", "C4", "C5"],
      dependsOn: ["S1", "S2"],
      integrationScenarios: [
        "WHEN a job and a matching window exist THE SYSTEM SHALL propose the assignment",
      ],
      stubs: [],
    },
  ],
  waves: [
    { index: 0, sliceIds: ["S0"] },
    { index: 1, sliceIds: ["S1", "S2"] },
    { index: 2, sliceIds: ["S3"] },
  ],
  contracts: [
    { id: "C1", name: "Scheduling API v1 schema", kind: "api", ownerSliceId: "S0" },
    { id: "C2", name: "JobScheduled event", kind: "event", ownerSliceId: "S0" },
    { id: "C3", name: "Shared job model", kind: "data", ownerSliceId: "S0" },
    { id: "C4", name: "Job intake API", kind: "api", ownerSliceId: "S1" },
    { id: "C5", name: "AvailabilityChanged event", kind: "event", ownerSliceId: "S2" },
  ],
};
