# docker-box stack

`compose.yaml` is the production stack behind `https://brainstorm.g1lom.xyz`. It is deployed by a
Dockhand git stack that clones this public repository and builds the images on docker-box:

- compose path: `deploy/docker-box/compose.yaml`
- context directory: `.` (build paths in the file are relative to it)
- branch: `main`

```text
client -> Nginx Proxy Manager (TLS, brainstorm.g1lom.xyz) -> 10.16.0.117:47280 -> caddy:80
caddy: /api/v1/auth/* (server-to-server login bridge) -> 404, internal network only
       /api/v1/*, /v1/*, /healthz, /readyz, /livez -> backend:8000
       everything else (pages, /api/auth/*, Next.js route handlers) -> frontend:3000
```

| Service | Role |
|---|---|
| `caddy` | Only published port (`47280` -> `80`); Caddyfile baked into the image (`deploy/caddy/`); SSE flushed immediately; only `NET_BIND_SERVICE` kept |
| `frontend` | Next.js standalone server, uid 1000, `BACKEND_MODE=http` |
| `backend` | FastAPI API, uid 10001, JWT authentication |
| `init` | One-shot: Alembic migrations, then creates the administrator with `brainstorm-agent user create` when absent; reruns are no-ops |
| `postgres` | Durable store, named volume `postgres-data` |
| `redis` | Session locks and rate limits, named volume `redis-data` |

Backend, frontend and `init` run without root and without any Linux capability; every service has
`no-new-privileges`. LiteLLM is not part of the stack: the backend calls the existing gateway on docker-box
(`http://10.16.0.117:4000/v1`).

## Variables

Set the secrets as Dockhand stack variables resolved from 1Password
(`VAR=op://Agents/dockhand-docker-box-brainstorm-agent/<VAR>`), never in the compose file or a
committed `.env`. A missing secret makes the deployment fail (`${VAR:?}`).

### Secrets (required, no default)

| Variable | Used by | Content |
|---|---|---|
| `BRAINSTORM_LLM_API_KEY` | backend `OPENAI_API_KEY` | LiteLLM virtual key for the docker-box gateway |
| `BRAINSTORM_JWT_SECRET` | backend `JWT_SECRET_KEY`, frontend `BACKEND_JWT_SECRET` | Shared HS256 secret, `openssl rand -hex 32` |
| `BRAINSTORM_AUTH_BRIDGE_SECRET` | backend and frontend `AUTH_BRIDGE_SECRET` | Server-to-server login bridge secret, `openssl rand -hex 32`, distinct from the JWT secret |
| `BRAINSTORM_AUTH_SECRET` | frontend `AUTH_SECRET` | Auth.js session cookie secret, `openssl rand -base64 32` |
| `BRAINSTORM_POSTGRES_PASSWORD` | postgres, backend `DATABASE_URL` | URL-safe database password, `openssl rand -hex 24` |

### First deployment only

| Variable | Used by | Content |
|---|---|---|
| `BRAINSTORM_ADMIN_PASSWORD` | init | Password of the bootstrap administrator; required while the account does not exist (`init` fails otherwise), then remove it from the stack so it no longer appears in the `init` container environment |

### Settings (optional, defaults shown)

| Variable | Default | Purpose |
|---|---|---|
| `BRAINSTORM_PUBLIC_URL` | `https://brainstorm.g1lom.xyz` | Auth.js `AUTH_URL` (public origin; the API is same-origin, no CORS needed) |
| `BRAINSTORM_BIND_ADDRESS` | `10.16.0.117` | Host address of the published port `47280` |
| `BRAINSTORM_ADMIN_EMAIL` | `admin@brainstorm.g1lom.xyz` | Bootstrap administrator login |
| `BRAINSTORM_ADMIN_DISPLAY_NAME` | `Administrator` | Bootstrap administrator display name |
| `BRAINSTORM_LLM_MODE` | `openai` | `fake` runs the deterministic offline model (tests only) |
| `BRAINSTORM_LLM_BASE_URL` | `http://10.16.0.117:4000/v1` | OpenAI-compatible gateway |
| `BRAINSTORM_MODEL_NAME` | `glm-5.3-flash` | Default model; `claude-opus-5-5` is the strong model |
| `BRAINSTORM_LLM_TIMEOUT_SECONDS` | `60` | Per-call LLM timeout |
| `BRAINSTORM_REDIS_LOCK_TIMEOUT_SECONDS` | `300` | Must exceed three LLM timeouts (five with the challenge pass) |
| `BRAINSTORM_LOG_LEVEL` | `INFO` | Backend log level |

The administrator is created only when its email does not exist yet: setting
`BRAINSTORM_ADMIN_PASSWORD` later does not rotate the password (use
`brainstorm-agent user set-password` in the backend container).

## Validation before deployment

On `codex-dev`, with throwaway secrets in a `chmod 600` file outside the repository:

```bash
docker compose -p bs-test --env-file ../test.env -f deploy/docker-box/compose.yaml config -q
heavy docker compose -p bs-test --env-file ../test.env -f deploy/docker-box/compose.yaml build
docker compose -p bs-test --env-file ../test.env -f deploy/docker-box/compose.yaml up -d --wait
set -a; . ../test.env; set +a
BRAINSTORM_COMPOSE="docker compose -p bs-test --env-file ../test.env -f deploy/docker-box/compose.yaml" \
  deploy/smoke.sh http://127.0.0.1:47280
docker compose -p bs-test --env-file ../test.env -f deploy/docker-box/compose.yaml down -v
```

The test file sets `BRAINSTORM_BIND_ADDRESS=127.0.0.1` and `BRAINSTORM_LLM_MODE=fake`.
`deploy/smoke.sh` checks the login page, Auth.js, `/readyz`, that the bridge answers 404 publicly,
an administrator login through the bridge from inside the backend container, then creates a
session and plays a JSON and an SSE turn with a JWT.

The frontend `http` mode is complete from lot 7b: until then the browser login calls endpoints
that the backend does not expose yet, while the API itself is fully usable.
