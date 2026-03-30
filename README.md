# brainstorm-agent

Structured brainstorming backend for project framing, built with FastAPI, LangGraph, SQLAlchemy, Postgres, and Redis.

## What it does

The service guides a user through a fixed workflow:

1. Initial pitch
2. Problem framing and 5W1H
3. User story mapping
4. Event storming
5. Impact mapping
6. Risk storming / pre-mortem
7. Backlog synthesis

On every assistant turn it returns:

- a structured summary
- explicit uncertainties and open questions
- targeted follow-up questions
- a Markdown stage document

Stage transitions are hybrid:

- LLM or heuristic structured analysis
- deterministic code-level validation of required fields

The service does not skip stages and does not persist critical state in Redis.

## Architecture

```text
src/brainstorm_agent/
  api/          FastAPI routes and dependency wiring
  core/         enums, schemas, stage contracts, validators
  graph/        LangGraph turn orchestration
  persistence/  SQLAlchemy models and repositories
  services/     LLM adapters, Markdown rendering, session service
  settings/     environment-backed settings
```

Supporting assets:

- `src/brainstorm_agent/resources/prompts/v1/`: packaged versioned prompt files
- `docs/adr/`: architecture decisions
- `examples/litellm/config.yaml`: example LiteLLM registration
- `tests/unit`, `tests/integration`, `tests/end2end`

## Local setup

```bash
uv sync --group dev
cp .env.example .env
uv run ruff format .
uv run ruff check .
uv run ty check src tests
uv run pytest
```

Run the API directly:

```bash
uv run uvicorn brainstorm_agent.api.main:create_app --factory --host 127.0.0.1 --port 8000
```

Or via CLI:

```bash
uv run brainstorm-agent serve
```

## Docker Compose

```bash
docker compose up --build
```

Services started:

- `app`: FastAPI backend on `http://localhost:8000`
- `postgres`: durable session/document store
- `redis`: optional session locking and coordination

## Environment variables

Core configuration:

- `DATABASE_URL`
- `REDIS_URL`
- `LLM_MODE`
- `OPENAI_BASE_URL`
- `OPENAI_API_KEY`
- `MODEL_NAME`
- `OPENAI_TIMEOUT_SECONDS`
- `PROMPT_VERSION`
- `PROMPT_BASE_PATH`
- `OPENAI_FACADE_MODEL_NAME`
- `REDIS_LOCK_TIMEOUT_SECONDS`
- `REDIS_LOCK_BLOCKING_TIMEOUT_SECONDS`
- `HOST`
- `PORT`
- `LOG_LEVEL`
- `LOG_JSON`

Recommended modes:

- `LLM_MODE=heuristic` for local dry runs and tests
- `LLM_MODE=openai` with `OPENAI_BASE_URL`, `OPENAI_API_KEY`, and `MODEL_NAME` for a real model backend or LiteLLM proxy

## API

Base prefix: `/api/v1`

Endpoints:

- `GET /v1/models`
- `POST /v1/chat/completions`
- `POST /sessions`
- `POST /sessions/{session_id}/messages`
- `GET /sessions/{session_id}`
- `GET /sessions/{session_id}/messages`
- `GET /sessions/{session_id}/document`
- `GET /sessions/{session_id}/documents`

### Create a session

```bash
curl -X POST http://localhost:8000/api/v1/sessions
```

### Send a user message

```bash
curl -X POST http://localhost:8000/api/v1/sessions/<session_id>/messages \
  -H "Content-Type: application/json" \
  -d '{
    "content": "A service that helps teams turn rough project ideas into structured plans.",
    "modality": "text"
  }'
```

### Example response shape

```json
{
  "session_id": "uuid",
  "current_stage": "stage_1_problem_framing",
  "processed_stage": "stage_0_pitch",
  "stage_clear_enough": true,
  "assistant_message": "Stage 0 is clear enough. We can move to the next stage.",
  "summary": "Stage 0 currently covers ...",
  "facts": [],
  "assumptions": [],
  "decisions": [],
  "uncertainties": [],
  "open_questions": [],
  "risks": [],
  "step_markdown": "# Structured Summary\n...",
  "transition_decision_reason": "All coded stage requirements are satisfied and no blocking questions remain.",
  "next_stage": "stage_1_problem_framing"
}
```

## OpenAI-compatible facade

The backend also exposes a minimal OpenAI-compatible surface for LiteLLM and generic clients:

- `GET /v1/models`
- `POST /v1/chat/completions`

The public alias is controlled through `OPENAI_FACADE_MODEL_NAME` and defaults to `brainstorm-agent`.

### Session continuity contract

The OpenAI-compatible facade remains stateful.

- If `metadata.session_id` is missing, the backend creates a new brainstorming session.
- If `metadata.session_id` is present, the backend continues that persisted session.
- The response includes the session id in:
  - the `brainstorm.session_id` field
  - the `X-Brainstorm-Session-Id` response header

The facade processes the latest user message from `messages[]`.
It does not attempt to reconstruct the full persistent state from client-side chat history alone.

### Example `chat/completions` request

```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "brainstorm-agent",
    "messages": [
      {
        "role": "user",
        "content": "I need an agent that helps teams turn vague project ideas into a structured backlog."
      }
    ],
    "metadata": {}
  }'
```

### Example OpenAI-compatible response shape

```json
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "created": 1743360000,
  "model": "brainstorm-agent",
  "choices": [
    {
      "index": 0,
      "finish_reason": "stop",
      "message": {
        "role": "assistant",
        "content": "Please answer the blocking questions...\\n\\n# Structured Summary\\n..."
      }
    }
  ],
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 84,
    "total_tokens": 96
  },
  "brainstorm": {
    "session_id": "uuid",
    "current_stage": "stage_0_pitch",
    "processed_stage": "stage_0_pitch",
    "next_stage": null,
    "stage_clear_enough": false,
    "summary": "Stage 0 currently covers ...",
    "open_questions": [],
    "transition_decision_reason": "Blocking questions remain open."
  }
}
```

## LiteLLM registration

LiteLLM can register this backend as an OpenAI-compatible upstream by exposing the facade endpoint through its proxy configuration.

Official LiteLLM docs show:

- `model_list` entries in `config.yaml` for model registration
- OpenAI-style proxy usage through a single `base_url`

Sources:

- [LiteLLM getting started](https://docs.litellm.ai/)

Example config shipped in this repo:

- [examples/litellm/config.yaml](/Users/g1lom/Documents/brainstorm-agent/examples/litellm/config.yaml)

Example:

```yaml
model_list:
  - model_name: brainstorm-agent
    litellm_params:
      model: openai/brainstorm-agent
      api_base: http://app:8000/v1
      api_key: not-used
```

This works because the brainstorming backend now exposes `/v1/models` and `/v1/chat/completions`.

### Local LiteLLM wiring

To run LiteLLM next to the backend locally:

```bash
docker compose -f docker-compose.yml -f docker-compose.litellm.yml up --build
```

Then call LiteLLM on `http://localhost:4000` with the registered model name `brainstorm-agent`.

## Workflow principles

- Facts, assumptions, decisions, risks, and open questions stay separated.
- Each turn creates a versioned Markdown document for the processed stage.
- The current session state is persisted as structured JSON plus normalized history tables.
- Redis is used only for non-critical session locking.

## Validation

Quality gates used locally:

```bash
uv run ruff format .
uv run ruff check .
uv run ty check src tests
uv run pytest -m unit --no-cov
uv run pytest -m integration --no-cov
uv run pytest -m end2end --no-cov
uv run pre-commit run --all-files
```
