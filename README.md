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

- Typed structured analysis and conversational replies
- deterministic code-level validation of required fields

The service does not skip stages and does not persist critical state in Redis.

## Repository layout

- `backend/`: Python source, tests, migrations, packaging and Dockerfile
- `frontend/`: Next.js workspace (see `frontend/README.md`)
- `docs/`, `skills/`: shared governance
- `deploy/`, `docker-compose*.yml`, `examples/`: cross-service deployment

## Backend architecture

```text
backend/src/brainstorm_agent/
  api/          FastAPI routes and dependency wiring
  core/         enums, schemas, stage contracts, validators
  graph/        LangGraph turn orchestration
  persistence/  SQLAlchemy models and repositories
  services/     LLM adapters, Markdown rendering, session service
  settings/     environment-backed settings
```

Supporting assets:

- `backend/src/brainstorm_agent/resources/prompts/v2/`: packaged versioned prompt files
- `docs/adr/`: architecture decisions
- `examples/litellm/config.yaml`: example LiteLLM registration
- `examples/litellm/config.openwebui.yaml`: LiteLLM config for OpenWebUI-oriented deployments
- `examples/openwebui/.env.example`: OpenWebUI OpenAI-compatible connection example
- `backend/migrations/`: Alembic schema history
- `backend/tests/unit`, `backend/tests/integration`, `backend/tests/end2end`

## Local setup

```bash
cd backend
uv sync --group dev
cp .env.template .env
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

Migration helpers:

```bash
uv run brainstorm-agent migrate --revision head
uv run brainstorm-agent hash-api-key "replace-me"
uv run brainstorm-agent hash-api-key "replace-me" --pepper "server-side-secret"
```

## Frontend

`frontend/` is a Next.js (App Router) workspace: login (password, plus SSO when OIDC is
configured), sessions list and the framing workspace (streamed chat, versioned stage documents
with diff, 8-stage stepper with readiness and coverage, open questions, review bar, delivery
slicing view, exports). The browser only calls the Next.js server, which proxies to the backend
with a short-lived signed JWT. Until the application API lands, `BACKEND_MODE=mock` serves an
in-memory demo backend.

```bash
cd frontend
pnpm install
cp .env.template .env.local   # set AUTH_SECRET
pnpm dev
```

See [frontend/README.md](frontend/README.md) for the architecture, checks and container image.

## Docker Compose

Run Compose commands from the repository root. Docker work for this project runs on a Linux host
with Docker (BuildKit is required).

| File | Purpose |
|---|---|
| `docker-compose.yml` | Development: backend, frontend, Postgres, Redis, LiteLLM; development defaults only |
| `docker-compose.prod.yml` | Self-hosted production: Caddy, frontend, backend, Postgres, Redis, bundled LiteLLM; secrets required |
| `deploy/docker-box/compose.yaml` | The `brainstorm.g1lom.xyz` Dockhand stack, external LiteLLM (see [its README](deploy/docker-box/README.md)) |

```bash
docker compose up --build
```

Development services (host ports bound to `127.0.0.1`, overridable with `BACKEND_PORT`,
`FRONTEND_PORT`, `LITELLM_PORT`, `POSTGRES_PORT`, `REDIS_PORT`):

- `frontend`: Next.js on `http://localhost:3000`
- `backend`: FastAPI on `http://localhost:8000`, JWT authentication, `LLM_MODE=fake` by default
- `init`: one-shot migrations and bootstrap of `admin@example.com` / `brainstorm-admin`
- `litellm`: gateway on `http://localhost:4000` (master key `sk-dev-brainstorm`) forwarding every
  model to `LLM_UPSTREAM_BASE_URL` with `LLM_UPSTREAM_API_KEY`; run with `LLM_MODE=openai` to use it
- `postgres`, `redis`

The frontend runs `BACKEND_MODE=http` against the backend (complete from lot 7b); set
`FRONTEND_BACKEND_MODE=mock` to work on the UI with the in-memory demo backend.

`deploy/smoke.sh` checks a running stack end to end (login page, Auth.js, `/readyz`, bridge login of
the administrator, session creation, JSON and SSE turns):

```bash
BRAINSTORM_JWT_SECRET=dev-only-jwt-secret-0123456789abcdef \
BRAINSTORM_AUTH_BRIDGE_SECRET=dev-only-bridge-secret-0123456789abcdef \
BRAINSTORM_ADMIN_EMAIL=admin@example.com BRAINSTORM_ADMIN_PASSWORD=brainstorm-admin \
  deploy/smoke.sh http://127.0.0.1:3000 http://127.0.0.1:8000
```

Images:

- `backend/Dockerfile` (root context): multi-stage `uv` build, runs as uid 10001, healthcheck on
  `/readyz`; the entrypoint serves the API or runs the command it is given (`docker/init.sh`).
- `frontend/Dockerfile` (`frontend/` context): Next.js standalone output, uid 1000, healthcheck on
  `/api/health`.
- `deploy/caddy/Dockerfile`: Caddy with `deploy/caddy/Caddyfile` baked in.

Formal schema upgrades now use Alembic. For local development you can still rely on auto-creation, but for persistent environments prefer:

```bash
uv run brainstorm-agent migrate --revision head
```

All Python CLI commands below run from `backend/`. Default prompts are packaged
resources. A relative `PROMPT_BASE_PATH` override resolves from that working directory.

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
- `ENABLE_AUTH`
- `AUTH_API_KEYS`
- `AUTH_MODE`
- `AUTH_API_KEY_HASHES`
- `AUTH_API_KEY_PEPPER`
- `JWT_SECRET_KEY`
- `JWT_ALGORITHM`
- `JWT_AUDIENCE`
- `JWT_ISSUER`
- `LOG_LEVEL`
- `LOG_JSON`
- `REQUIRE_HUMAN_VALIDATION_FOR_TRANSITIONS`
- `AUTO_CREATE_SCHEMA`
- `RUN_DB_MIGRATIONS_ON_STARTUP`
- `RATE_LIMIT_ENABLED`
- `RATE_LIMIT_REQUESTS`
- `RATE_LIMIT_WINDOW_SECONDS`
- `RATE_LIMIT_NAMESPACE`

Recommended modes:

- `LLM_MODE=fake` for deterministic tests (scripted responses; no network)
- `LLM_MODE=openai` (default) with `OPENAI_BASE_URL`, `OPENAI_API_KEY`, and `MODEL_NAME` for a real model backend or LiteLLM proxy

## API

Business API base prefix: `/api/v1`

Business endpoints:

- `POST /sessions`
- `POST /sessions/{session_id}/messages`
- `POST /sessions/{session_id}/messages/stream`
- `GET /sessions/{session_id}`
- `GET /sessions/{session_id}/messages`
- `GET /sessions/{session_id}/document`
- `GET /sessions/{session_id}/documents`
- `GET /sessions/{session_id}/export/markdown`
- `GET /sessions/{session_id}/export/json`
- `GET /sessions/{session_id}/reviews`
- `POST /sessions/{session_id}/reviews`

Operational endpoints:

- `GET /healthz`
- `GET /readyz`
- `GET /livez`
- `GET /metrics`

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
  "next_stage": "stage_1_problem_framing",
  "requires_human_review": false,
  "pending_review": null
}
```

### Session SSE example

```bash
curl -N -X POST http://localhost:8000/api/v1/sessions/<session_id>/messages/stream \
  -H "Content-Type: application/json" \
  -d '{
    "content": "A service that helps teams turn rough project ideas into structured plans.",
    "modality": "text"
  }'
```

### Human review gate

When `REQUIRE_HUMAN_VALIDATION_FOR_TRANSITIONS=true`, a stage can be clear enough without advancing immediately.
In that mode:

- turn responses may include `"requires_human_review": true`
- the session exposes `pending_human_review`
- `POST /api/v1/sessions/{session_id}/reviews` approves or rejects the transition

Example:

```bash
curl -X POST http://localhost:8000/api/v1/sessions/<session_id>/reviews \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "approved",
    "note": "Transition accepted by project lead."
  }'
```

## OpenAI-compatible facade

The backend also exposes a minimal OpenAI-compatible surface for LiteLLM and generic clients:

- `GET /v1/models`
- `POST /v1/chat/completions`
- `POST /v1/responses`

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

### Example `/v1/responses` request

```bash
curl -X POST http://localhost:8000/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "brainstorm-agent",
    "input": "Help me frame a discovery workflow for product teams.",
    "metadata": {}
  }'
```

### Streaming support

The backend supports SSE-style streaming for:

- `POST /api/v1/sessions/{session_id}/messages/stream`
- `POST /v1/chat/completions` with `"stream": true`
- `POST /v1/responses` with `"stream": true`

Streaming is currently incremental at the transport layer only: the backend emits the final computed turn as SSE events once the LangGraph turn is complete.

## LiteLLM registration

LiteLLM can register this backend as an OpenAI-compatible upstream by exposing the facade endpoint through its proxy configuration.

Official LiteLLM docs show:

- `model_list` entries in `config.yaml` for model registration
- OpenAI-style proxy usage through a single `base_url`

Sources:

- [LiteLLM getting started](https://docs.litellm.ai/)

Example config shipped in this repo:

- [examples/litellm/config.yaml](examples/litellm/config.yaml)

Example:

```yaml
model_list:
  - model_name: brainstorm-agent
    litellm_params:
      model: openai/brainstorm-agent
      api_base: http://backend:8000/v1
      api_key: not-used
```

This works because the brainstorming backend now exposes `/v1/models` and `/v1/chat/completions`.

## Security and operations

- Auth supports:
  - `AUTH_MODE=api_key` with `AUTH_API_KEY_HASHES` or `AUTH_API_KEYS`
  - `AUTH_MODE=jwt` with `JWT_SECRET_KEY`
  - `AUTH_MODE=hybrid` to accept either
- Prefer `AUTH_API_KEY_HASHES` in production. For stronger at-rest protection, pair them with `AUTH_API_KEY_PEPPER` and generate values with:

```bash
uv run brainstorm-agent hash-api-key "replace-me" --pepper "server-side-secret"
```

- Send the raw API key through `X-API-Key`; map its normalized stored hash to an active user with `AUTH_API_KEY_OWNERS`.
- Send JWT credentials through `Authorization: Bearer <token>`.
- Enable Redis-backed throttling with `RATE_LIMIT_ENABLED=true`.
- Every HTTP response includes an `X-Request-Id` header.
- `GET /metrics` exposes Prometheus-style counters for requests, auth failures, and rate-limit rejections.
- `GET /readyz` fails with `503` when the database check does not pass.

## Production deployment

`docker-compose.prod.yml` runs the whole stack behind Caddy
([deploy/caddy/Caddyfile](deploy/caddy/Caddyfile)):

- `/api/v1/*`, `/v1/*` and the probes (`/healthz`, `/readyz`, `/livez`) go to the backend, except
  the server-to-server login bridge `/api/v1/auth/*`, which answers 404 (the frontend reaches it on
  the internal network);
- everything else, including Auth.js `/api/auth/*` and the Next.js route handlers, goes to the
  frontend;
- responses are flushed immediately so server-sent events are never buffered;
- `BRAINSTORM_SITE_ADDRESS` defaults to `:80` (behind a TLS proxy); a domain name makes Caddy
  obtain certificates itself.

Secrets are required variables (`${VAR:?}`) with the names listed in
[deploy/docker-box/README.md](deploy/docker-box/README.md), plus `BRAINSTORM_PUBLIC_URL`,
`BRAINSTORM_ADMIN_EMAIL` and the LiteLLM upstream (`LLM_UPSTREAM_BASE_URL`,
`LLM_UPSTREAM_API_KEY`). `BRAINSTORM_LLM_API_KEY` is also the bundled LiteLLM master key and must
start with `sk-`. Optional backend and frontend tuning goes in `backend/.env` and `frontend/.env`.

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up --build -d
```

The one-shot `init` service applies Alembic migrations and creates the administrator before the
backend starts, so `RUN_DB_MIGRATIONS_ON_STARTUP` stays `false` in containers.

## LiteLLM and OpenWebUI

LiteLLM can also sit in front of this backend: register the facade `http://backend:8000/v1` as
shown in [examples/litellm/config.yaml](examples/litellm/config.yaml) and
[examples/litellm/config.openwebui.yaml](examples/litellm/config.openwebui.yaml). With
authentication enabled, give LiteLLM an API key accepted by the backend (`AUTH_MODE=hybrid`).

OpenWebUI can use LiteLLM as an OpenAI-compatible backend. The Open WebUI docs for OpenAI-compatible providers document `OPENAI_API_BASE_URL` and `OPENAI_API_KEY`; the example in [examples/openwebui/.env.example](examples/openwebui/.env.example) uses that contract with LiteLLM in front of this backend.

## Workflow principles

- Facts, assumptions, decisions, risks, and open questions stay separated.
- Each turn creates a versioned Markdown document for the processed stage.
- The current session state is persisted as structured JSON plus normalized history tables.
- Redis is used only for non-critical session locking.

## Validation

Run Python quality gates from `backend/`:

```bash
uv run ruff format .
uv run ruff check .
uv run ty check src tests
uv run pytest -m unit --no-cov
uv run pytest -m integration --no-cov
uv run pytest -m end2end --no-cov
uv run pytest -m "unit or integration or end2end" --cov=src
cd ..
uv run --project backend pre-commit run --all-files
```

Run frontend quality gates from `frontend/`:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
```

Validate the containers from the repository root (on a Docker host):

```bash
docker compose config -q
docker compose --env-file .env.test -f docker-compose.prod.yml config -q
docker compose --env-file .env.test -f deploy/docker-box/compose.yaml config -q
docker compose --env-file .env.test -f deploy/docker-box/compose.yaml build
docker compose --env-file .env.test -f deploy/docker-box/compose.yaml up -d --wait
BRAINSTORM_COMPOSE="docker compose --env-file .env.test -f deploy/docker-box/compose.yaml" \
  deploy/smoke.sh http://127.0.0.1:47280   # with the .env.test secrets exported
docker compose --env-file .env.test -f deploy/docker-box/compose.yaml down -v
```

`.env.test` holds throwaway secrets, `BRAINSTORM_BIND_ADDRESS=127.0.0.1` and
`BRAINSTORM_LLM_MODE=fake`; never commit it. CI builds the three images on every change to them.

### Typed stage contracts (prompt v2)

Each stage has one Pydantic field contract. Analysis returns a patch: null leaves a field
unchanged; a non-null value replaces it. Identified lists (including backlog and risks) merge
by id. Facts, assumptions, decisions and questions also merge by stable ids; resolving a question
requires its id in `resolved_question_ids`. Use `resolved_item_ids` to retract other identified items.
`uncertainties` is the complete current list and replaces earlier uncertainties after clarification. No model decision can bypass deterministic stage gates.

`LLM_OUTPUT_MODE=json_schema` sends a strict JSON schema. Set `json_object` or `tool` explicitly
if the selected LiteLLM model does not support strict schemas. Unsupported-provider errors are
surfaced; the service does not silently downgrade. Invalid JSON/schema gets exactly one repair
attempt with the validation error, then an actionable error with no persisted partial turn.

The asynchronous turn has analysis (maximum two calls), an optional findings-only challenge
(`LLM_CHALLENGE_PASS=off|findings`, maximum two calls), and a conversational reply. The adapter
exposes reply deltas; current HTTP streams retain their final-result envelope until the event API
lot. Provider token counts are persisted per assistant turn in the session JSON and returned by
the facade; fake mode reports zero. No word-count estimates are used.

`LLM_MAX_TOKENS=4096` bounds each response. `LLM_CONTEXT_TURNS=8` bounds transcript context;
previous stages contribute summaries only. Content follows the user's language, while headings
and schema keys remain English. Prompt `v1` remains available; `v2` is the default.

`REDIS_LOCK_TIMEOUT_SECONDS` must exceed `OPENAI_TIMEOUT_SECONDS` times 3 (challenge off)
or 5 (findings). SDK transport retries are disabled. The default 180 seconds covers the 30-second
per-call timeout in both modes. See [LiteLLM aliases](examples/litellm-models.yaml).

OpenAI mode requires explicit `OPENAI_BASE_URL` and `OPENAI_API_KEY` before a provider client
can be created. There is no implicit public endpoint or placeholder credential fallback.

### Users and session ownership

Apply `uv run brainstorm-agent migrate` from `backend/`, then administer users:

```bash
uv run brainstorm-agent user create user@example.invalid --display-name "Example User"
uv run brainstorm-agent user set-password user@example.invalid
uv run brainstorm-agent user disable user@example.invalid
```

Passwords are read through a hidden terminal prompt. There is no public signup or
password-reset endpoint. Existing sessions belong to bootstrap user
`00000000-0000-0000-0000-000000000001` (`bootstrap@localhost.invalid`); set its password
through the CLI if access to historical sessions is needed.

For production enable authentication and configure JWT or hybrid mode. JWT `sub`
must be an active backend user id, with a short-lived `exp`; configure matching
`JWT_ISSUER` and `JWT_AUDIENCE`. Map every service API key to a user using
`AUTH_API_KEY_OWNERS`, a JSON object from the stored normalized hash to user id.
Keys without a mapping and disabled users are rejected. Sessions, documents,
exports, reviews and OpenAI-compatible conversations are accessible only to their
owner. A foreign session returns 404.

The recommended frontend integration uses Auth.js Credentials on the Next.js
server: POST `{email, password}` to `/api/v1/auth/verify`, with server-only
`X-Auth-Bridge: <AUTH_BRIDGE_SECRET>`. Response: `{id, email, display_name}`.
Next.js then signs short-lived backend JWTs for this user. The browser must never
receive the bridge secret or JWT signing secret. Use a high-entropy bridge secret
(at least 32 random bytes) and a signing secret dedicated to this service.

With `OIDC_ISSUER` configured, the trusted Auth.js OIDC callback verifies tokens
and email verification, then POSTs `{issuer, subject, email, display_name}` to
`/api/v1/auth/oidc` with the same bridge authentication. Repeated issuer/subject
pairs resolve the same user; email collisions return 409 and never link accounts
automatically. A missing issuer disables OIDC. Both bridge routes are limited by
`LOGIN_RATE_LIMIT_REQUESTS` (5) per `LOGIN_RATE_LIMIT_WINDOW_SECONDS` (60), per
normalized identity and flow (Credentials email or OIDC issuer/subject), returning 429 with `Retry-After`. Authentication-disabled
development uses a single bootstrap owner. See [ADR 0009](docs/adr/0009-user-authentication.md).
