# AGENTS.md

## Mission

Build and maintain a persistent backend service for strict project framing and brainstorming.
The product is a stage-driven conversational backend, not a general-purpose assistant.

## Product Scope

The service must:

- guide a user through a fixed multi-stage framing workflow
- persist state and documents across turns
- remain model-agnostic through an OpenAI-compatible API
- expose a stable HTTP API for future OpenWebUI and LiteLLM integration
- produce a structured Markdown deliverable at every assistant turn

The service must not:

- skip stages
- invent business answers
- advance on vague or contradictory inputs
- couple domain logic to a specific LLM provider

## Canonical Workflow

The business workflow is fixed and ordered:

1. `stage_0_pitch`
2. `stage_1_problem_framing`
3. `stage_2_user_story_mapping`
4. `stage_3_event_storming`
5. `stage_4_impact_mapping`
6. `stage_5_risk_storming`
7. `stage_6_backlog_synthesis`

Each turn must produce:

1. a structured summary
2. explicit open questions and uncertainties
3. targeted next questions
4. a versioned Markdown stage document

Every stage document must explicitly separate:

- facts
- assumptions
- decisions
- risks
- open questions

## Agent Roles

### Orchestrator Agent

The main runtime agent is a deterministic orchestrator around LangGraph.
Responsibilities:

- ingest user input
- update structured state
- ask the LLM for bounded analysis/generation tasks
- apply rule-based completeness validation
- block or allow stage transitions
- persist turns, decisions, and documents

### Evaluation Prompts

Evaluation prompts are not independent agents.
They are bounded prompt assets used by the orchestrator for:

- completeness checks
- contradiction detection
- question generation
- Markdown rendering

### Sub-agents

No autonomous multi-agent runtime is part of V1.
If sub-agents are added later, they must remain optional and subordinate to the orchestrator.

## AI Tooling Layout

Use the following repository layout for AI-facing assets:

- `AGENTS.md`: source of truth for runtime and delivery rules
- `agent.md`: concise execution contract referencing `AGENTS.md`
- `SKILLS.md`: local skill index and usage guidance
- `skills/`: reusable project-local delivery skills
- `src/brainstorm_agent/resources/prompts/README.md`: prompt organization and versioning policy
- `src/brainstorm_agent/resources/prompts/v*/system.md`: global system prompt
- `src/brainstorm_agent/resources/prompts/v*/stages/*.md`: stage-specific prompts
- `src/brainstorm_agent/resources/prompts/v*/evaluation/*.md`: evaluation prompts
- `src/brainstorm_agent/resources/prompts/v*/rendering/*.md`: rendering prompts

Rules:

- prompts must be versioned by folder, not overwritten in place without intent
- one file per prompt responsibility
- prompt names must describe the job, not the implementation detail
- business rules live in domain code and governance docs, not only in prompts
- prompt outputs must target typed schemas defined in application code

## Working Rules

- Use English for code, docs, prompts, schemas, and runtime artifacts.
- Allow French only for complementary user-facing discussion when needed.
- Keep architecture modular and boundaries explicit.
- Prefer typed enums for user-facing choices:
  - use `enum.StrEnum` for single-choice values
  - use `enum.Flag` or `enum.IntFlag` for combinable values
  - provide explicit conversion helpers between strings and enum values
- Write Google-style docstrings with explicit types in `Args`, `Returns`, and `Raises` when relevant.
- Keep runtime dependencies explicit and configurable.
- Do not place business rules in FastAPI routes or prompt strings alone.

## Required Runtime Boundaries

Keep separate modules for:

- API transport
- orchestration graph
- domain models and validation rules
- persistence
- prompt loading
- Markdown rendering
- provider adapters and settings

## Delivery Workflow

- Work only on a dedicated non-`main` branch.
- Before substantial implementation, align on scope with the user and write the validated plan in `plan.md`.
- Read and respect:
  - `docs/engineering/DEFINITION_OF_DONE.md`
  - `docs/engineering/REVIEW_RUNBOOK.md`
  - `docs/adr/README.md`
- Create an ADR whenever architecture or structural choices are introduced or changed.
- Before each push or PR, run one explicit dead-code pass.
- Keep `README.md`, `.env.template`, and local validation config synchronized with behavior changes.
- End each feature delivery with a GitHub PR.
- After PR creation or update, poll CI and review status every 60 seconds until:
  - CI is complete, and
  - at least one review is present or definitively absent

## Quality Gates

- Unit tests are the default local feedback loop.
- Integration tests must cover persistence and boundary behavior.
- End-to-end tests must cover the major user-visible conversation flow.
- Every bug fix starts with a failing test.
- Every major user-visible flow needs at least one end-to-end test.
- Transition logic must be covered by deterministic tests.

## Pre-PR Checklist

Run locally:

- `uv run ruff format .`
- `uv run ruff check .`
- `uv run ty check src tests`
- `uv run pytest -m unit`
- `uv run pytest -m integration`
- `uv run pytest -m end2end`
- `uv run pre-commit run --all-files`

Then verify:

- dead code has been removed
- modified code paths use Google-style docstrings with explicit types
- `tests/unit` mirrors `src/brainstorm_agent` structure in touched areas
- `README.md` matches the current API and setup
- `.env.template` matches the environment contract
- ADRs were added or updated when architecture changed

## Local Skills

Project-local skills live in `skills/`.
Current expected set:

- `skills/architecture/SKILL.md`
- `skills/code-style/SKILL.md`
- `skills/testing/SKILL.md`
- `skills/tooling/SKILL.md`
- `skills/brainstorm-workflow/SKILL.md`
- `skills/review-followup/SKILL.md`
