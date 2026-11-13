# brainstorm-agent frontend

Next.js (App Router) workspace for the stage-driven framing workflow: sign in, manage sessions,
converse with the agent and follow the stage documents, readiness, open questions, reviews and
delivery slices live.

Stack: Next.js 16, React 19, TypeScript strict, Tailwind CSS 4, shadcn/ui (Base UI), Auth.js v5,
Vitest + Testing Library, Playwright, pnpm.

## Run locally

The frontend always talks to the real backend. For development, `pnpm dev:backend` starts it in
`fake` LLM mode on a throwaway SQLite database (needs [`uv`](https://docs.astral.sh/uv/); no
Docker, no Redis, no model):

```bash
cd frontend
pnpm install
cp .env.template .env.local   # set AUTH_SECRET and the secrets of scripts/e2e-env.mjs
pnpm dev:backend              # http://127.0.0.1:8100, terminal 1
pnpm dev                      # http://localhost:3000, terminal 2
```

`dev:backend` creates the accounts of `scripts/e2e-env.mjs` (`journey@example.com`, ...,
password `e2e-password-0123`). The fake model reads `key: value` lines, for example:

```text
pitch: A weekly meal planner that builds the shopping list
clear: weekly plan, shopping list
ambiguous: budget handling
missing: pricing model
```

## Checks

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test        # Vitest + Testing Library
pnpm build
pnpm e2e         # Playwright (chromium): standalone build + real backend in fake mode
```

`pnpm e2e` starts both servers itself (`playwright.config.ts`): the backend through
`scripts/e2e-backend.mjs` and the standalone build. It covers sign-in (wrong password, backend
login limit, SSO hidden), session creation, one streamed turn, the updated document and
coverage, the pending review (input paused, 409 from the backend), approval, the Markdown export,
and the LLM failure, rate-limit and expired-session states. Screenshots go to
`test-results/screenshots/` (`E2E_SCREENSHOT_DIR` overrides it). Install the browser once with
`pnpm exec playwright install chromium`. CI runs the same suite (`frontend-e2e` job) and uploads
the screenshots and traces.

## Architecture

```text
src/
  auth.ts, auth.config.ts   Auth.js: Credentials provider (login bridge), OIDC when configured
  proxy.ts                  redirects signed-out page requests to /login
  app/
    login/                  login page and server actions
    (app)/sessions/         sessions list and workspace pages
    api/auth/               Auth.js route handlers
    api/backend/            proxy route handlers (JSON and SSE relay)
    api/health/             container healthcheck
  lib/backend/              the only module that talks to the backend (server-only)
    generated/              OpenAPI types and stage field specs (`pnpm generate:api`)
    types.ts                short names for the generated contract
    http.ts, jwt.ts         typed HTTP client, short-lived signed JWT per call
    route.ts                route-handler helpers: CSRF and auth checks, error mapping, SSE
  lib/api/                  browser client of the proxy and SSE parser
  components/               sessions list and workspace (chat, document, stepper, review, ...)
    workspace/view-model.ts presentation derived from the backend state (no business rule)
```

- The browser only calls `/api/backend/*` on the Next.js server. Credentials, the backend URL and
  the secrets stay server-side.
- Sign-in: the Credentials provider checks the password through the backend login bridge
  (`POST /api/v1/auth/verify` with `X-Auth-Bridge: AUTH_BRIDGE_SECRET`); OIDC profiles are linked
  through `POST /api/v1/auth/oidc` and must carry `email_verified: true`. The backend limits
  login attempts per e-mail; its 429 is shown as "Too many sign-in attempts".
- Every session call carries a JWT signed with `BACKEND_JWT_SECRET` whose `sub` is the backend
  user id (`BACKEND_JWT_TTL_SECONDS`, default 60 s).
- Mutating proxy requests must be same-origin (`Sec-Fetch-Site`, `Origin` against `AUTH_URL`)
  and JSON. Pages send a Content Security Policy (`img-src 'self' data: blob:`, no remote
  scripts, no framing).
- Turns are `POST /api/backend/sessions/{id}/turns`; the response is the backend's Server-Sent
  Events stream relayed unbuffered (`turn.started`, `analysis.status`, `message.delta`,
  `document.updated`, `coverage.updated`, `stage.changed`, `review.required`, `turn.completed`,
  `error`).
- Proxy errors share one JSON shape `{"error": {"code", "message", "retryAfterSeconds?"}}` with
  the status relayed (401, 403, 404, 409 conflict or review pending, 422, 429 with
  `Retry-After`, 502 LLM error, 503 backend unavailable).
- `cacheComponents` is not enabled: every page depends on the signed-in user, so pages render
  dynamically.

See [ADR 0011](../docs/adr/0011-frontend-architecture.md).

## Container

`Dockerfile` builds the Next.js `standalone` output and runs it as the non-root `node` user
(uid 1000) on port 3000, with a healthcheck on `/api/health`:

```bash
docker build -t brainstorm-agent-frontend frontend
docker run --rm -p 3000:3000 --env-file frontend/.env.local brainstorm-agent-frontend
```

The Compose stacks at the repository root build it next to the backend; see the root `README.md`
and `deploy/docker-box/README.md`.
