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

- `prompts/v*/system.md`: global behavior and invariants
- `prompts/v*/stages/`: one file per workflow stage
- `prompts/v*/evaluation/completeness.md`: completeness and blocking holes
- `prompts/v*/evaluation/contradiction-challenge.md`: contradiction and ambiguity review
- `prompts/v*/rendering/step-markdown.md`: Markdown rendering instructions

## Deliverables

- Updated stage contracts
- Updated prompt assets
- Updated validation logic plan
- ADR reference when stage architecture changes materially
