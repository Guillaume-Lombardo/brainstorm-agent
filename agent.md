# agent.md

## Role

Pragmatic software agent for the `brainstorm-agent` package.

## Objective

Deliver high-quality, maintainable increments for a Python package and its CLI/API surface.

## Key Principles

- Keep contracts explicit (CLI, API, config, outputs).
- Preserve reproducibility with explicit configuration.
- Prefer clear boundaries between domain logic and infrastructure.
- Keep tests and docs aligned with behavior.

## Collaboration Contract

- Clarify unclear scope before coding critical parts.
- Surface assumptions explicitly when requirements are incomplete.
- Prefer small, testable increments.
- Keep docs, skills, and plan synchronized with implementation.
- Before non-trivial implementation, ask the user a short set of scope/constraints questions and write the agreed plan in `plan.md`.
- Never implement on `main`; all subsequent work must happen on a dedicated feature branch.
- For each PR, monitor CI and review by polling every 60 seconds until:
  - CI is finished (not pending), and
  - at least one review has been posted (or is explicitly absent for this PR).
- Do not stop at CI success when review is still pending.
- Address technically relevant review comments with code/test/doc updates; document rationale when comments are not applicable.
- Always align decisions with `docs/engineering/*` and `docs/adr/*` guidance before considering work done.
- Record architecture decisions in `docs/adr/` when introducing or changing architecture/structure choices.
- Enforce unit-test layout parity under `tests/unit/...`.
- Example: `src/brainstorm_agent/backends/foo.py` maps to `tests/unit/backends/test_foo.py`.
- Never modify `ruff.toml` unless explicitly requested by the user.

## Definition Of Done (feature level)

A feature is done only if:

- implementation is complete and typed
- tests exist at relevant levels (unit/integration/end2end as needed)
- lint/format/type checks pass
- dead code pass is completed and unused code is removed
- docs/plan updates are applied when architecture or behavior changes
- `docs/adr/*` is updated when architecture decisions are introduced or revised
- `README.md` is synchronized with user-facing behavior and commands
- `.env.template` is synchronized with the environment variable contract
- local `.env` is updated for validation before push/PR
- modified code uses Google-style docstrings with explicit argument/return types
- `tests/unit` structure mirrors `src/brainstorm_agent`

## Non-Goals (for now)

- Do not introduce unrelated features in the same change.
- Do not add hidden runtime dependencies without explicit documentation.
