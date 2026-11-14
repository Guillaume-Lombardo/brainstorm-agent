# Prompts

## Purpose

This directory stores versioned prompt assets for the brainstorming backend.
Prompts are externalized so they remain reviewable, testable, and easy to evolve without hiding product rules in code.

## Layout

- `v1/system.md`: global system prompt
- `v1/stages/`: one prompt per workflow stage
- `v1/evaluation/`: prompts for completeness and contradiction analysis
- `v1/rendering/`: prompts for Markdown generation

## Rules

- Keep prompts in English.
- One responsibility per file.
- Version prompts by directory (`v1`, `v2`, ...).
- Do not encode the only source of truth in prompts; mirror critical rules in code and schemas.
- Prefer schema-targeted outputs over open-ended prose when prompts feed application logic.

## Migration Policy

- Minor wording changes may update the current version if contracts do not change.
- Any output-shape or behavioral contract change should create a new prompt version directory.

## v2

v2 injects typed stage field descriptions and strict patch schemas at runtime. Field lists
are derived from the Pydantic contracts, never duplicated in prompt assets. Previous stage
context is summarized; current state and recent transcript are bounded separately. The rendering
asset is a template consumed by the deterministic Markdown renderer. v1 remains unchanged.

`v2/rendering/final-stage-document.md` is a separate bounded rewrite task targeting
`core.final_documents.FinalStageDocument`. It receives only state-derived business content,
never turn summaries, transcript, gate decisions or clarification history. It runs once
on validation; ordinary working Markdown continues to use `step-markdown.md`. Invalid
output is not repaired: the same schema is built deterministically from state instead.
The final contract has a short prose overview, optional artefact sections and five distinct
governance lists. Each substantive item belongs once in its most specific section;
normalization removes presentation duplicates, and the rewrite merges near-duplicates
without omitting business content. This prompt is introduced together with ADR 0013.
