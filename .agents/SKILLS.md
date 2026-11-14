# SKILLS.md

## Purpose

This file maps project-local skills to the active initiative in `.agents/plan.md`.
Use the smallest set of skills that covers the validated scope.

## Core Skills

- `.agents/skills/architecture/SKILL.md`
  - Use for module boundaries, domain contracts, LangGraph shape, and ADR-worthy decisions.
- `.agents/skills/code-style/SKILL.md`
  - Use for Python typing, enum conventions, docstrings, and schema discipline.
- `.agents/skills/testing/SKILL.md`
  - Use for unit, integration, and end-to-end coverage strategy.
- `.agents/skills/tooling/SKILL.md`
  - Use for `uv`, lint/type/test workflow, local setup, and PR validation.
- `.agents/skills/brainstorm-workflow/SKILL.md`
  - Use for stage definitions, prompt responsibilities, transition criteria, and document shape.
- `.agents/skills/review-followup/SKILL.md`
  - Use after PR review comments arrive.
- `.agents/skills/release/SKILL.md`
  - Use to build and publish the backend package (TestPyPI, PyPI).

## Skill Selection Rules

- Start from `.agents/plan.md`.
- Use `architecture` and `brainstorm-workflow` for scope affecting the stage engine.
- Add `testing` whenever behavior or persistence changes.
- Add `tooling` for environment, CI, Docker, or local validation work.
- Add `code-style` for schema or contract changes.

## Operating Rules

- Keep artifacts in English by default.
- Keep prompt assets versioned under `backend/src/brainstorm_agent/resources/prompts/v*/`.
- Keep delivery guidance in sync with:
  - `AGENTS.md`
  - `docs/engineering/DEFINITION_OF_DONE.md`
  - `docs/engineering/REVIEW_RUNBOOK.md`
  - `docs/adr/README.md`
