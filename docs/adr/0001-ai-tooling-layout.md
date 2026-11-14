# ADR 0001: AI tooling layout for the structured brainstorming backend

## Status

Accepted, amended on 2026-11-14 (AI tooling moved to `.agents/`).

## Context

The repository started as a generic Python package template with lightweight AI governance files.
The target product is a strict brainstorming backend with:

- fixed business stages
- externalized prompts
- deterministic transition rules
- a future LangGraph runtime

Without a clear layout, agent rules, prompts, and workflow constraints would drift across files and become difficult to review or version.

## Decision

Adopt the following AI tooling structure:

- `AGENTS.md` as the canonical governance document
- `agent.md` as a short execution contract that points back to `AGENTS.md`
- `SKILLS.md` as the local skill index
- `skills/brainstorm-workflow/SKILL.md` for workflow-specific delivery guidance
- `src/brainstorm_agent/resources/prompts/v1/` for packaged versioned prompt assets split by responsibility:
  - `system.md`
  - `stages/*.md`
  - `evaluation/*.md`
  - `rendering/*.md`

Business invariants remain duplicated intentionally between governance docs, prompts, and future code-level validators so that prompt wording is never the only source of truth.

## Amendment (2026-11-14): `.agents/` directory

`AGENTS.md` stays at the repository root, where coding agents discover it automatically.
The other AI tooling moves to `.agents/` so the root only holds product, documentation and
deployment entry points:

- `.agents/agent.md`: short execution contract
- `.agents/SKILLS.md`: local skill index
- `.agents/skills/*/SKILL.md`: project-local delivery skills
- `.agents/plan.md`: validated plan and roadmap

Prompt assets stay packaged under `backend/src/brainstorm_agent/resources/prompts/`.

## Consequences

### Positive

- Prompt assets are reviewable and versionable.
- Governance becomes specific to the real product.
- Runtime implementation can load prompts by stable path and version.
- Stage responsibilities and evaluation prompts are clearly separated.

### Negative

- More files must be kept synchronized.
- Future prompt contract changes will need explicit versioning discipline.

## Alternatives Considered

### Keep prompts embedded in code

Rejected because prompt changes would be harder to review and version.

### Keep generic template governance

Rejected because it does not constrain the product enough and would allow architecture drift during implementation.
