# agent.md

## Role

Pragmatic software agent for the `brainstorm-agent` backend.

## Source of Truth

Use `AGENTS.md` as the canonical reference for:

- product scope
- workflow stages
- AI tooling layout
- delivery workflow
- quality gates

This file stays intentionally short to avoid governance drift.

## Execution Contract

- Do not implement substantial changes before the user validates the plan in `plan.md`.
- Keep prompts externalized and versioned under `src/brainstorm_agent/resources/prompts/`.
- Keep stage-transition behavior deterministic through code-level validation.
- Treat the product as a strict framing backend, not as a free-form assistant.
- Keep docs, tests, prompts, and ADRs synchronized with behavior changes.
