# ADR 0011: Frontend architecture

- Status: Accepted
- Date: 2026-11-13

## Context

Lot 7 adds a Next.js workspace on top of the application API (ADR 0010) and the user model and
login bridge (ADR 0009). The browser must never hold a backend credential, the workspace must
follow the backend contract without a hand-maintained copy, and the backend stays the only place
where stages are validated (AGENTS.md: no business rule in the UI or in prompts alone).

Lot 7a built the UI on provisional types and an in-memory mock backend. Lot 7b connects it to the
real contract.

## Decision

**Backend for frontend.** The browser only calls `/api/backend/*` route handlers on the Next.js
server. `src/lib/backend/` is the only module that talks to the backend; it is `server-only`.
Caddy does not route `/api/v1/auth/*`, so the login bridge is reachable from the frontend
container only.

**Authentication.**

- Auth.js v5 with JWT sessions (8 h). The Credentials provider calls `POST /api/v1/auth/verify`
  with `X-Auth-Bridge: AUTH_BRIDGE_SECRET`.
- The optional OIDC provider is registered only when issuer, client id and client secret are all
  set. A profile signs in only with `email_verified: true` and an e-mail address (`signIn`
  callback). It is then linked or provisioned through `POST /api/v1/auth/oidc` by issuer and
  subject.
- Every session call carries a fresh HS256 JWT (`sub` = backend user id, `iss`/`aud`, default
  60 s) signed with `BACKEND_JWT_SECRET`. Both secrets are at least 32 characters and must
  differ; they are checked on first use, so builds need no secret.

**Login attempt limiting.** The backend already limits login attempts per normalized e-mail (5
per minute by default), shared through Redis across instances. The frontend adds no limiter of its
own:

- A per-IP limit in Next.js would key on a client address that is not trustworthy behind the two
  reverse proxies (Nginx Proxy Manager, then Caddy).
- That limit would also be per-process.

The backend 429 becomes a `CredentialsSignin` subclass with `code = "rate_limited"`, shown as "Too
many sign-in attempts".

**Contract.**

- `pnpm generate:api` writes `generated/api.ts` (openapi-typescript) and `generated/stage-fields.ts`
  (the stage field contracts: name, label, gate-required flag, value kind) from the backend app.
- `types.ts` only gives short names to generated schemas and adds the iteration constants (`STAGES`,
  `TURN_EVENT_TYPES`, ...). The constants are checked against the generated unions with
  `satisfies`.
- The HTTP client derives paths, parameters, bodies and responses from the generated `paths`, so a
  contract change fails the type check.
- `components/workspace/view-model.ts` derives presentation from the backend state (stepper status,
  field coverage, editable kinds, inline-edit drafts). It never re-validates a stage.

**Turns.** `POST /api/backend/sessions/{id}/turns` relays the backend Server-Sent Events
unchanged and unbuffered, keepalive comments included (the parser ignores comments). The relay
ends a stream that stays silent for 60 seconds (four backend keepalives) with a `turn_failed`
`error` frame and cancels the backend request; the LLM timeout no longer bounds a turn there. The browser reducer applies `message.delta` as tentative text and
`coverage.updated`, `stage.changed` and `review.required` as state patches. It reloads the stored
session after `turn.completed`. A terminal `error`, or a refused request, restores the message in
the composer.

**Errors.** Every proxy error is `{"error": {"code", "message", "retryAfterSeconds?"}}` with the
status relayed:

| Status | Code |
|---|---|
| 401 | `unauthorized` |
| 403 | `forbidden` |
| 404 | `not_found` |
| 409 | `conflict`, or `review_pending` before a turn stream |
| 422 | `validation_error` |
| 429 | `rate_limited`, with `Retry-After` |
| 502/504 | `llm_error` |
| 503 | `backend_unavailable` |

Details of 5xx responses are never relayed. `BackendError` is recognised by a registered symbol
brand: Next.js bundles the module more than once (route handlers, Auth.js callbacks).

**Browser hardening.**

- Mutating proxy requests are rejected unless they are same-origin (`Sec-Fetch-Site`, and `Origin`
  against `AUTH_URL`) and carry a JSON body, on top of the `SameSite=Lax` session cookie.
- Identifiers are validated before they become URL segments.
- Pages send a Content Security Policy:
  - `default-src 'self'`;
  - `img-src 'self' data: blob:`, so stage Markdown cannot load remote images;
  - `connect-src 'self'`;
  - `frame-ancestors 'none'` and `object-src 'none'`;
  - inline scripts allowed, because Next.js hydration needs them (`eval` in development only);
  - no `form-action`, because SSO redirects to the identity provider.

**Tests.**

- Vitest and Testing Library cover the view-model, the reducer, the components, the HTTP client and
  the route guards, with fixtures typed against the generated contract.
- Playwright runs the production build against the real backend in `fake` LLM mode on SQLite
  (`scripts/e2e-backend.mjs`), with no Docker and no Redis. It runs locally and in the
  `frontend-e2e` CI job.
- The in-memory mock backend is removed: one contract and one implementation.

## Alternatives considered

- Browser calls to the backend with CORS and a browser-held token: exposes a backend credential
  and duplicates authorization logic.
- Keeping the mock backend for UI work: a second implementation that drifts from the contract. The
  fake LLM mode gives deterministic data without it.
- A per-IP login limiter in Next.js: see above. The backend's per-identity limit is shared and
  already enforced.
- Nonce-based CSP: requires dynamic rendering of every page and middleware; deferred until scripts
  from other origins are needed.

## Consequences

- Positives:
  - A contract change breaks `pnpm typecheck`.
  - No secret reaches the browser.
  - The end-to-end tests exercise the real auth, proxy and stream path.
- Negatives:
  - UI development needs `uv` to run the backend (`pnpm dev:backend`).
  - `'unsafe-inline'` scripts stay allowed.
- Risks:
  - The JWT secret and the bridge secret are shared between two services. Rotation needs both to be
    redeployed together.
