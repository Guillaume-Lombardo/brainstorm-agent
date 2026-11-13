---
name: brainstorm-workflow
description: Design and evolve the strict multi-stage brainstorming workflow, including prompts, validation rules, stage outputs, and transition policies.
---

# Brainstorm Workflow Skill

## Purpose

Keep the product focused on strict project framing through ordered stages and explicit artifacts.

## Workflow Rules

1. Preserve the fixed stage order.
2. Separate LLM analysis from rule-based transition validation.
3. Keep one prompt file per responsibility.
4. Keep stage outputs aligned with typed schemas.
5. Treat Markdown documents as first-class persisted artifacts.

## Required Outputs Per Turn

Every assistant turn must produce:

- `summary`
- `facts`
- `assumptions`
- `decisions`
- `uncertainties`
- `open_questions`
- `risks`
- `markdown`
- `stage_is_clear_enough`
- `transition_decision_reason`

## Stage Design Rules

- Never skip a stage.
- Never invent missing business information.
- Explicitly mark uncertainty and contradictions.
- Ask targeted questions until required fields are clear enough.
- Only advance when coded validation rules and bounded LLM analysis agree.

## Prompt Organization

- `backend/src/brainstorm_agent/resources/prompts/v*/system.md`: global behavior and invariants
- `backend/src/brainstorm_agent/resources/prompts/v*/stages/`: one file per workflow stage
- `backend/src/brainstorm_agent/resources/prompts/v*/evaluation/completeness.md`: completeness and blocking holes
- `backend/src/brainstorm_agent/resources/prompts/v*/evaluation/contradiction-challenge.md`: contradiction and ambiguity review
- `backend/src/brainstorm_agent/resources/prompts/v*/rendering/step-markdown.md`: Markdown rendering instructions

## Deliverables

- Updated stage contracts
- Updated prompt assets
- Updated validation logic plan
- ADR reference when stage architecture changes materially

## Canonical stage order

1. `stage_0_pitch`
2. `stage_1_problem_framing`
3. `stage_2_user_story_mapping`
4. `stage_3_event_storming`
5. `stage_4_impact_mapping`
6. `stage_5_risk_storming`
7. `stage_6_backlog_synthesis`
8. `stage_7_delivery_slicing`

Stage 7 requires a slice-0 walking skeleton, uniquely assigned MVP backlog items, owned domains,
contracts with unique owners, acyclic dependencies and integration scenarios for every slice.
Cross-cutting work belongs to slice-0. Domain ownership references stage 3 aggregates, or stage 2
capabilities only when event storming was declared not relevant. The server derives waves from
explicit dependencies and consumed-contract owners, with slice-0 preceding other slices.
See ADR 0008. Export functions live in `services/delivery.py`; HTTP exposure belongs to lot 6.
