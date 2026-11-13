# ADR 0008: Delivery slicing stage

- Status: Accepted
- Date: 2026-11-13

## Context

Backlog synthesis does not define independently developable vertical slices or shared integration
contracts. Decision D7 extends the canonical workflow to eight ordered stages.

## Decision

Append `stage_7_delivery_slicing` after stage 6. Stages are persisted as strings, so no SQL migration
is required. Preserve the first seven identifiers and their contracts. Existing completed stage 6
sessions can continue into stage 7 on their next validated turn.

Use typed `DeliveryFields` and a complete replacement slice list (ids remain stable). Slice-0 is the
walking skeleton and owns cross-cutting backlog work and shared foundational contracts. Other slices
own distinct stage 3 aggregates; stage 2 capabilities are allowed only when stage 3 is explicitly
not relevant. Contracts have ids and specifications, one provider and zero or more consumers.
Each slice records a goal, backlog references, dependencies, integration scenarios and needed stubs.

Register deterministic rules alongside the lot 2 declarative gates. Every MVP item is assigned once,
references exist, the graph is acyclic, consumed contracts have exactly one owner, and every slice
has a complete GWT or EARS scenario. Cross-cutting work is assigned exactly once to slice-0.
Edges include declared dependencies, contract owners and slice-0 as the prerequisite of other slices.
Topological waves are derived, sorted deterministically, and never accepted from provider output.

Render a table, waves, contract matrix and per-slice specs even while eliciting incomplete plans.
Pure export functions produce one Markdown artifact per slice and JSON containing full backlog,
assignments, effective dependencies and waves. Invalid plans cannot be exported. Routes remain the
responsibility of lot 6; there is no new provider coupling or configuration.

## Consequences

Clients must support an eighth stage. The new prompt is in v2; historical v1 assets remain unchanged.
Fake mode supports explicit JSON slice fixtures and scripted typed responses, without invented
business answers. Unit tests cover gates, waves and rendering; the persisted fake workflow covers
eight stages. Evaluation-harness scenarios are deferred to lot 3.
