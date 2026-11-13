# brainstorm-agent frontend

Next.js (App Router) workspace for the stage-driven framing workflow: sign in, manage sessions,
converse with the agent and follow the stage documents, readiness, open questions, reviews and
delivery slices live.

Stack: Next.js 16, React 19, TypeScript strict, Tailwind CSS 4, shadcn/ui (Base UI), Auth.js v5,
Vitest + Testing Library, Playwright, pnpm.

## Run locally

```bash
cd frontend
pnpm install
cp .env.template .env.local   # set AUTH_SECRET
pnpm dev                      # http://localhost:3000
```

With `BACKEND_MODE=mock` (the default outside production) no backend is needed. Demo accounts:
`demo@example.com` (two seeded sessions) and `empty@example.com` (no session), password
`brainstorm-demo` unless `MOCK_USER_PASSWORD` is set.

Mock-only commands, sent as a chat message, reproduce backend failures: `/simulate llm_error`,
`/simulate rate_limited`, `/simulate forbidden`.

## Checks

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test        # Vitest + Testing Library
pnpm build
pnpm e2e         # Playwright (chromium) against the standalone build and the mock backend
```

`pnpm e2e` writes screenshots of the login, sessions, workspace and delivery views to
`test-results/screenshots/` (`E2E_SCREENSHOT_DIR` overrides it). Install the browser once with
`pnpm exec playwright install chromium`.

## Architecture

```text
src/
  auth.ts, auth.config.ts   Auth.js: Credentials provider, OIDC provider when configured
  proxy.ts                  redirects signed-out page requests to /login
  app/
    login/                  login page and server actions
    (app)/sessions/         sessions list and workspace pages
    api/auth/               Auth.js route handlers
    api/backend/            proxy route handlers (JSON and SSE relay)
    api/health/             container healthcheck
  lib/backend/              the only module that talks to the backend (server-only)
    types.ts                provisional contract (replaced by generated OpenAPI types in lot 7b)
    client.ts               BackendClient interface
    mock.ts                 in-memory implementation (BACKEND_MODE=mock)
    http.ts, jwt.ts         HTTP implementation with a short-lived signed JWT (BACKEND_MODE=http)
    route.ts                route-handler helpers: auth check, error mapping, SSE response
  lib/api/                  browser client of the proxy and SSE parser
  components/               sessions list and workspace (chat, document, stepper, review, ...)
```

- The browser only calls `/api/backend/*` on the Next.js server. Credentials, the backend URL and
  the JWT secret stay server-side; every backend call carries a JWT signed with
  `BACKEND_JWT_SECRET` whose `sub` is the backend user id (`BACKEND_JWT_TTL_SECONDS`, default
  60 s).
- Turns are `POST /api/backend/sessions/{id}/turns`; the response is the backend's Server-Sent
  Events stream relayed unbuffered (`turn.started`, `analysis.status`, `message.delta`,
  `document.updated`, `coverage.updated`, `stage.changed`, `review.required`,
  `questions.updated`, `turn.completed`, `error`).
- Proxy errors share one JSON shape `{"error": {"code", "message", "retryAfterSeconds?"}}` with
  the status relayed (401, 403, 404, 409 review pending, 422, 429 with `Retry-After`, 502 LLM
  error, 503 backend unavailable).
- `cacheComponents` is not enabled: every page depends on the signed-in user, so pages render
  dynamically.
- The HTTP endpoint paths and the payload types are provisional until the lot 6 API and its
  generated TypeScript types land (lot 7b).

## Container

`Dockerfile` builds the Next.js `standalone` output and runs it as the non-root `node` user
(uid 1000) on port 3000, with a healthcheck on `/api/health`:

```bash
docker build -t brainstorm-agent-frontend frontend
docker run --rm -p 3000:3000 --env-file frontend/.env.local brainstorm-agent-frontend
```

The Compose stacks at the repository root build it next to the backend; see the root `README.md`
and `deploy/docker-box/README.md`.
