# plan.md

## Purpose

This file is intentionally collaborative.
Before major implementation, the agent and the user must align on scope, priorities, and constraints.
The plan is then updated in this file and used as the execution reference.

## Planning Protocol (Agent)

For any non-trivial feature/refactor:

1. Ask the user for missing context before coding.
2. Confirm:
   - business goal
   - in-scope and out-of-scope
   - constraints (time, compatibility, infra, dependencies)
   - acceptance criteria
3. Propose a short, testable implementation plan.
4. Wait for user confirmation (or revisions).
5. Execute and keep this file synchronized with decisions and status.
6. For any architecture/structure decision, create or update an ADR in `docs/adr/` and reference it in the PR.

## Discovery Questions

Use these questions when scope is unclear:

- What problem are we solving right now?
- What is explicitly out of scope for this iteration?
- Which interfaces/contracts must stay backward compatible?
- What level of test coverage is required for acceptance?
- Are there release or operational constraints to account for?

## Plan Template

Copy/update this block for each initiative:

### Initiative: <name>

- Status: `planned | in_progress | blocked | done`
- Owner: `<user|agent|both>`
- Objective:
- In scope:
- Out of scope:
- Constraints:
- Risks:
- Acceptance criteria:
- ADR impact: `none | required`
- ADR reference(s): `docs/adr/NNNN-short-title.md` (required when ADR impact is `required`)

#### Steps

- [ ] Step 1
- [ ] Step 2
- [ ] Step 3

#### Validation

- [ ] `uv run ruff format .`
- [ ] `uv run ruff check .`
- [ ] `uv run ty check src tests`
- [ ] `uv run pytest -m unit`
- [ ] `uv run pytest -m integration`
- [ ] `uv run pytest -m end2end`
- [ ] `uv run pre-commit run --all-files`

#### Notes / Decisions

- Decision:
- Rationale:
- Follow-up:
- ADR record: `docs/adr/NNNN-short-title.md` (or `none` with rationale)
