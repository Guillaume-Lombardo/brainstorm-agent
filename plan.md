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

### Initiative: AI tooling alignment for structured brainstorming backend

- Status: `done`
- Owner: `both`
- Objective: Align repository governance and prompt assets with the target backend before runtime implementation.
- In scope:
  - audit current repository structure and AI tooling
  - define target AI tooling layout for agents, skills, and prompts
  - create versioned prompt assets for the fixed business workflow
  - update governance files to make the brainstorming backend the canonical product target
- Out of scope:
  - FastAPI implementation
  - LangGraph runtime implementation
  - database schema and infrastructure delivery
- Constraints:
  - no backend implementation before user validation
  - keep prompts externalized and versionable
  - preserve existing repo delivery rules
- Risks:
  - governance drift between `AGENTS.md`, `agent.md`, and `SKILLS.md`
  - prompt structure becoming the only source of business truth
- Acceptance criteria:
  - repository state and gaps are documented
  - target prompt and agent structure is explicit
  - required prompt files exist and are readable
  - governance files are coherent with the product brief
- ADR impact: `required`
- ADR reference(s): `docs/adr/0001-ai-tooling-layout.md`

#### Steps

- [x] Audit repository structure, tooling, and current AI artifacts
- [x] Define target architecture for agents, prompts, and responsibilities
- [x] Update governance files and create versioned prompt assets

#### Validation

- [x] `uv run ruff format .`
- [x] `uv run ruff check .`
- [x] `uv run ty check src tests`
- [x] `uv run pytest -m unit`
- [x] `uv run pytest -m integration`
- [x] `uv run pytest -m end2end`
- [x] `uv run pre-commit run --all-files`

#### Notes / Decisions

- Decision: Keep one source of truth in `AGENTS.md` and make `agent.md` a short pointer document.
- Rationale: This removes duplicated governance and reduces instruction drift.
- Follow-up: Implement runtime modules around the new prompt and workflow structure in a dedicated feature phase.
- ADR record: `docs/adr/0001-ai-tooling-layout.md`

### Initiative: Implement the structured brainstorming backend

- Status: `done`
- Owner: `agent`
- Objective: Deliver a working FastAPI + LangGraph backend with persistent staged brainstorming sessions, OpenAI-compatible model access, and Docker-based local execution.
- In scope:
  - application settings and environment contract
  - domain schemas and stage validation rules
  - SQLAlchemy persistence for sessions, turns, documents, and transition decisions
  - optional Redis integration for non-critical cache/coordination hooks
  - LangGraph orchestration for one conversation turn
  - FastAPI endpoints for session lifecycle and document retrieval
  - Dockerfile, docker-compose, README, and tests
- Out of scope:
  - OpenWebUI-specific integration
  - voice input implementation
  - human review endpoint implementation beyond architecture-ready placeholders
- Constraints:
  - keep prompts externalized under `src/brainstorm_agent/resources/prompts/`
  - use an OpenAI-compatible API through configurable `OPENAI_BASE_URL`, `OPENAI_API_KEY`, and `MODEL_NAME`
  - keep stage progression deterministic through coded validation rules
- Risks:
  - LangGraph integration drift if state boundaries are unclear
  - persistence complexity across sessions, documents, and versions
  - overfitting the LLM adapter to one provider behavior
- Acceptance criteria:
  - local Docker Compose starts app, Postgres, and Redis
  - session creation and message exchange work through HTTP
  - a structured Markdown deliverable is persisted on each turn
  - stage transitions are blocked when required fields are incomplete
  - unit, integration, and end-to-end coverage exists for core flows
- ADR impact: `required`
- ADR reference(s): `docs/adr/0002-backend-runtime-architecture.md`

#### Steps

- [x] Define runtime architecture, settings contract, and ADR
- [x] Implement domain models, prompt loading, and validation rules
- [x] Implement persistence models and repositories
- [x] Implement LangGraph orchestration and LLM adapter
- [x] Implement FastAPI routes and dependency wiring
- [x] Add Docker assets, docs, and test coverage

#### Validation

- [x] `uv run ruff format .`
- [x] `uv run ruff check .`
- [x] `uv run ty check src tests`
- [x] `uv run pytest -m unit`
- [x] `uv run pytest -m integration`
- [x] `uv run pytest -m end2end`
- [x] `uv run pre-commit run --all-files`

#### Notes / Decisions

- Decision: Use a real LangGraph state graph for turn orchestration with rule-based transition checks outside the LLM.
- Rationale: This satisfies the product constraint that stage progression must not depend only on free-form model output.
- Follow-up: Reassess streaming and human-review hooks after the core synchronous API is stable.
- ADR record: `docs/adr/0002-backend-runtime-architecture.md`
- Note: `langgraph` currently emits a Python 3.14 warning through `langchain-core` Pydantic V1 compatibility code during tests, but validation still passes.

### Initiative: Add an OpenAI-compatible facade for LiteLLM registration

- Status: `done`
- Owner: `agent`
- Objective: Expose the brainstorming backend behind a minimal OpenAI-compatible surface so it can be registered in LiteLLM and consumed by generic OpenAI clients.
- In scope:
  - `GET /v1/models`
  - `POST /v1/chat/completions`
  - stable public model alias configuration
  - session continuity through request metadata
  - LiteLLM example configuration and usage documentation
- Out of scope:
  - full `/v1/responses` implementation
  - streaming support on the OpenAI-compatible facade
  - authentication on the facade beyond future-ready design
- Constraints:
  - keep the existing session API backward compatible
  - preserve persistent server-side session state
  - avoid moving business logic into FastAPI routes
- Risks:
  - generic OpenAI clients may not preserve custom session metadata automatically
  - the facade could be mistaken for a fully generic OpenAI backend
- Acceptance criteria:
  - `/v1/models` exposes a stable alias for the brainstorming backend
  - `/v1/chat/completions` can create or continue a brainstorming session
  - the response includes a recoverable session identifier
  - README documents LiteLLM registration and the session continuity contract
  - automated tests cover the facade flow
- ADR impact: `required`
- ADR reference(s): `docs/adr/0003-openai-compatible-facade.md`

#### Steps

- [x] Add OpenAI-compatible schemas and facade service
- [x] Add `/v1/models` and `/v1/chat/completions`
- [x] Document LiteLLM configuration and local wiring
- [x] Add tests for facade behavior and session continuity

#### Validation

- [x] `uv run ruff format .`
- [x] `uv run ruff check .`
- [x] `uv run ty check src tests`
- [x] `uv run pytest -m unit`
- [x] `uv run pytest -m integration`
- [x] `uv run pytest -m end2end`
- [x] `uv run pre-commit run --all-files`

#### Notes / Decisions

- Decision: Use `metadata.session_id` as the continuity handle on the OpenAI-compatible facade.
- Rationale: It preserves the backend's persistent session model without forcing clients onto the first-party session API.
- Follow-up: Consider `/v1/responses` and SSE after validating real LiteLLM/OpenWebUI usage.
- ADR record: `docs/adr/0003-openai-compatible-facade.md`
