# SKILLS.md

## Purpose

This file maps project-local skills to the active initiative in `plan.md`.
Use the smallest set of skills that covers the validated scope.

## Core Skills

- `skills/architecture/SKILL.md`
  - Use for module boundaries, domain contracts, LangGraph shape, and ADR-worthy decisions.
- `skills/code-style/SKILL.md`
  - Use for Python typing, enum conventions, docstrings, and schema discipline.
- `skills/testing/SKILL.md`
  - Use for unit, integration, and end-to-end coverage strategy.
- `skills/tooling/SKILL.md`
  - Use for `uv`, lint/type/test workflow, local setup, and PR validation.
- `skills/brainstorm-workflow/SKILL.md`
  - Use for stage definitions, prompt responsibilities, transition criteria, and document shape.
- `skills/review-followup/SKILL.md`
  - Use after PR review comments arrive.

## Skill Selection Rules

- Start from `plan.md`.
- Use `architecture` and `brainstorm-workflow` for scope affecting the stage engine.
- Add `testing` whenever behavior or persistence changes.
- Add `tooling` for environment, CI, Docker, or local validation work.
- Add `code-style` for schema or contract changes.

## Operating Rules

- Keep artifacts in English by default.
- Keep prompt assets versioned under `src/brainstorm_agent/resources/prompts/v*/`.
- Keep delivery guidance in sync with:
  - `AGENTS.md`
  - `docs/engineering/DEFINITION_OF_DONE.md`
  - `docs/engineering/REVIEW_RUNBOOK.md`
  - `docs/adr/README.md`
