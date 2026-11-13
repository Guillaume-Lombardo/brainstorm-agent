# plan.md

## Roadmap v2: working agent, delivery slicing, Next.js application (remaining work)

- Status: `planned`
- Context: the 2026-11-12 audit found a solid infrastructure layer (auth, rate limiting, metrics,
  migrations, deployment assets) but a product loop that does not work end to end:
  - in `openai` mode the prompt never states the required field names checked by the validator,
    there is no structured output, and no retry/repair on invalid JSON;
  - extracted fields are overwritten on each turn instead of accumulated;
  - the heuristic mode only parses `key: value` lines and lets a one-character pitch pass stage 0
    by injecting canned ambiguities;
  - transition validation checks field presence plus a few hard-coded rules (3 risks minimum,
    stage 3 relevance justification, no blocking question), but nothing about vagueness or
    consistency;
  - the final deliverable is a flat backlog: no vertical slices, contracts or dependency graph that
    would allow parallel, integration-testable development;
  - streaming is a single final chunk, token usage counts words, the Redis lock TTL (30 s) is
    shorter than a worst-case turn (2 LLM calls x 30 s), sessions have no owner.
- Target: a monorepo application with a `backend/` (FastAPI + LangGraph + Postgres, LLM reached
  through LiteLLM with an OpenAI-compatible API) and a `frontend/` (Next.js + shadcn/ui).
- Out of scope: OpenWebUI agent mode / Pipe Function (deferred), group or team management,
  multi-agent personas, a "quick mode" that skips gates (conflicts with the no-skip rule).
- Delivery: one PR per lot, in order. Lots 6 and 7 may overlap once the event contract of lot 6 is
  merged.

### Decisions (validated with the user)

- D1. Authentication: login/password in the frontend, plus OIDC when configured. Multi-user, every
  session has an owner, no groups for now.
- D2. Monorepo: backend moved to `backend/`, frontend in `frontend/`.
- D3. Generated stage content follows the user's language; section headings and schema keys stay
  in English.
- D4. An earlier stage can be reopened; downstream stages are marked `stale` until revalidated.
- D5. Non-critical gaps may be recorded as default assumptions, always flagged "to confirm";
  critical fields can never default.
- D6. Evaluation models through LiteLLM aliases: strong model `claude-opus-5-5` (Opus 5.5), cheap
  model `glm-5.3-flash`.
- D7. A new eighth stage `stage_7_delivery_slicing` follows backlog synthesis.

### Defaults assumed (change if needed)

- Users are created by an administrator through the CLI; no self sign-up in v1.
- Password reset through the CLI only in v1.
- Existing sessions are assigned to a bootstrap user by the ownership migration.
- Prompts move to a new `v2` prompt folder (lot 1); `v1` stays untouched.

### Lot 0: Monorepo restructuring

- Objective: move the backend under `backend/` without behavior change, ready for `frontend/`.
- ADR impact: `required` (`docs/adr/0006-monorepo-layout.md`)

#### Steps

- [x] Move `src/`, `tests/`, `migrations/`, `alembic.ini`, `pyproject.toml`, `uv.lock`, `ruff.toml`,
      `.python-version`, `Dockerfile`, `docker/` and the backend env files to `backend/`.
- [x] Keep at the root: `AGENTS.md`, `agent.md`, `SKILLS.md`, `skills/`, `docs/`, `deploy/`, compose
      files, `.github/`, `.pre-commit-config.yaml`, `README.md`, `plan.md`, license and community
      files.
- [x] Merge the duplicated `.env.example` / `.env.template` into one backend `.env.template`.
- [x] Update CI (working directory, path filters per app), pre-commit hooks, compose build contexts,
      prompt base path defaults.
- [x] Update `AGENTS.md` (layout, pre-PR checklist commands), `README.md` (root overview + backend
      section), local skills that reference paths.
- [x] All existing checks green from `backend/`.

### Lot 1: Make the agent loop work with a real OpenAI-compatible model

- Objective: a free-form conversation through LiteLLM can complete every stage, with the state
  accumulating across turns and strict, typed LLM outputs.
- ADR impact: `required` (`docs/adr/0007-typed-stage-contracts-and-structured-outputs.md`)

#### Steps

- [x] Replace `extracted_fields: dict[str, Any]` with one Pydantic model per stage; the model is the
      single source for required fields, field descriptions, the prompt field list, validation and
      the JSON schema sent to the LLM.
- [x] Request structured outputs (`response_format` JSON schema, strict) generated from those models;
      add a configurable fallback (`json_object` or tool calling) for models without schema support
      (to verify for `glm-5.3-flash`).
- [x] On schema or JSON failure, retry once with the validation error fed back; then return an
      actionable error (no silent partial state).
- [x] Patch semantics: the LLM returns field updates, new items and resolved item ids; the server
      merges them into the accumulated stage state. Stable ids for facts, assumptions, decisions,
      risks, questions and backlog items across turns.
- [x] Prompt context: stage contract (fields + descriptions), current accumulated values and
      coverage, last N transcript turns, compact summaries of previous stages (no full session JSON
      dump).
- [x] Split the turn into a bounded structured analysis call and a conversational reply call that
      can be streamed; the contradiction challenge becomes an optional pass returning findings only
      (`LLM_CHALLENGE_PASS=off|findings`).
- [x] Async LLM client and turn processing (`AsyncOpenAI`).
- [x] Remove canned stage-0 fillers; the heuristic adapter becomes an explicit deterministic test
      double (`LLM_MODE=fake`, scripted responses); `openai` becomes the documented default.
- [x] New prompt folder `v2` with the field lists and output contracts.
- [x] Real token usage from the LLM response in turn records and in the OpenAI-compatible facade.
- [x] Settings validation: session lock TTL greater than the worst-case turn duration.
- [x] Use or delete the unused Markdown rendering prompt.
- [x] LiteLLM example config with the `claude-opus-5-5` and `glm-5.3-flash` aliases.
- [x] Contract tests with recorded LLM responses (valid, invalid JSON, schema mismatch, partial
      patch, retry path).

### Lot 2: Quality gates and elicitation (patterns from Spec Kit, Rasa CALM, Kiro)

- Objective: the gate blocks vague or contradictory answers through code, and each turn asks few,
  prioritized questions.
- ADR impact: `required` (declarative stage rules; extend ADR 0007)

#### Steps

- [x] Coverage taxonomy: each stage field is `clear | partial | missing`; code is authoritative for
      `missing`, the LLM proposes `partial` with a reason.
- [x] Declarative stage rules with rejections (condition + message), e.g.:
  - [x] measurable objectives contain a metric or a target value;
  - [x] at least 3 risks across at least 2 categories, no generic mitigation (`TBD`, empty);
  - [x] MVP scope items exist in the capability list;
  - [x] every backlog item links to an existing goal, risk or hypothesis id;
  - [x] stage 3 "not relevant" requires a justification (migrate the existing rule).
- [x] Readiness checklist per stage, rendered in the stage document (`passed/total`).
- [x] Question budget: at most 3 questions per turn, prioritized (scope > security/compliance > UX >
      technical), each with `why_it_matters`, optional answer options and a recommended option.
- [x] Default assumptions for non-critical gaps (D5), flagged and listed for confirmation.
- [x] Timestamped `Clarifications` log (question -> answer) in each stage document.
- [x] Cross-stage consistency checks (impact-map actors vs stage 1 actors, backlog vs MVP scope).
- [x] Stage 6 backlog items carry objective, definition of done, link, and optional EARS acceptance
      criteria ("WHEN ... THE SYSTEM SHALL ...").
- [x] Deterministic unit tests for every rule and for the transition decision table.

### Lot 3: Evaluation harness

- Objective: measure whether the agent blocks and advances correctly, per model, before UI work
  depends on it.
- ADR impact: `none`

#### Steps

- [x] Golden scenarios in YAML: persona, hidden project facts, scripted or simulated answers, and
      expectations (must block at stage X, must flag contradiction Y, must reach the last stage).
- [x] Simulated user driven by an LLM playing the persona with only its hidden facts.
- [x] Rubric-based LLM judge for document quality (specificity, traceability, no invented facts).
- [x] `brainstorm-agent eval` CLI with a report per model (D6): transition precision/recall, turns
      per stage, schema failures, latency, token cost.
- [x] Default runs on `glm-5.3-flash`; `claude-opus-5-5` for the strong reference and the judge.
- [x] CI runs the recorded-fixture subset only; full evaluation runs on demand.

### Lot 4: Stage 7, Delivery slicing

- Objective: the final deliverable splits the product into vertical slices that can be developed in
  parallel and tested in integration.
- ADR impact: `required` (`docs/adr/0008-delivery-slicing-stage.md`; canonical workflow change)

#### Steps

- [x] Add `stage_7_delivery_slicing` to the `Stage` enum and ordering (stages are stored as strings:
      no schema migration).
- [x] Update the canonical workflow in `AGENTS.md`, `README.md`, `skills/brainstorm-workflow` and the
      ADR index.
- [x] Typed stage model:
  - [x] slice 0 "walking skeleton": cross-cutting foundation and shared contracts (API schemas,
        events, shared data model);
  - [x] per slice: goal, backlog item ids, owned domain (from stage 3 aggregates/sub-systems, or
        from stage 2 capabilities when stage 3 was declared not relevant),
        provided and consumed contracts, dependencies, integration scenarios (Given/When/Then or
        EARS), stubs needed to work without the other slices;
  - [x] delivery waves derived from the dependency graph.
- [x] Stage prompt (`v2/stages/stage-7-delivery-slicing.md`) built from the story map backbone
      (stage 2), event storming (stage 3) and impact map (stage 4).
- [x] Deterministic rules:
  - [x] every MVP backlog item belongs to exactly one slice;
  - [x] the dependency graph is acyclic;
  - [x] every contract has exactly one owning slice and every consumed contract exists;
  - [x] every slice has at least one integration scenario;
  - [x] cross-cutting work is assigned to slice 0.
- [x] Rendering: slice table, waves, contract matrix, one spec section per slice.
- [x] Export: one Markdown spec per slice and a backlog JSON with dependencies and waves (usable as
      parallel work lots).
- [x] Evaluation scenarios extended to stage 7 (golden evaluation corpus delivered in lot 3).

### Lot 5: Users, authentication and ownership

- Objective: multi-user backend with login/password and optional OIDC (D1).
- ADR impact: `required` (`docs/adr/0009-user-authentication.md`)

#### Steps

- [x] `users` table (email, display name, Argon2id password hash, OIDC issuer + subject, active
      flag, timestamps) with an Alembic migration.
- [x] `owner_id` on sessions with a migration assigning existing sessions to a bootstrap user.
- [x] Authorization enforced in the shared session service (owner only), so every route and the
      OpenAI-compatible facade are covered.
- [x] Existing API-key auth kept for service clients, with each key mapped to an owning user
      (facade sessions are owned by that user).
- [x] Recommended flow (accepted in ADR 0009): Auth.js in Next.js with a Credentials provider
      (verified against the backend) and an OIDC provider enabled only when configured; the Next.js
      server calls the backend with a short-lived signed JWT (`sub` = user id) using the existing JWT
      mode; OIDC users are linked or provisioned by issuer + subject.
- [x] Login throttling with the existing rate limiter.
- [x] CLI: `user create`, `user set-password`, `user disable`.
- [x] Tests: password hashing, login success/failure, OIDC linking, ownership isolation between two
      users.

### Lot 6: Application API and event stream

- Objective: a stable, typed contract for the Next.js frontend.
- ADR impact: `required` (`docs/adr/0010-application-api-and-event-stream.md`)

Implementation decisions (validated lot 6 scope): preserve legacy endpoints; add typed application
endpoints backed by the existing owner-only session service. Persist metadata, comments and stale
markers additively in session JSON. Generate the versioned OpenAPI snapshot and frontend types.
Reuse lot 2 validators and elicitation metadata; exports delegate to lot 4 delivery functions.

#### Steps

- [x] Typed SSE event stream per turn: `turn.started`, `analysis.status`, `message.delta`,
      `document.updated`, `coverage.updated`, `stage.changed`, `review.required`, `turn.completed`,
      `error`; documented in OpenAPI.
- [x] `GET /sessions` (paginated, owner-scoped), `PATCH /sessions/{id}` (title, archive), soft
      delete.
- [x] Reopen an earlier stage with `stale` propagation to downstream stages (D4).
- [x] Direct edits: `PATCH` stage field values or items from the UI, then re-validate; comments on a
      document section feed the next turn.
- [x] Review endpoint: approve, reject, request changes with a note.
- [x] Document version diff endpoint.
- [x] Final consolidated framing document export, slice specs and backlog JSON export.
- [x] CORS settings; OpenAPI-to-TypeScript generation script for the frontend.
- [x] Integration tests for reopen/stale, edits, event order; end-to-end SSE test.

### Lot 7: Next.js frontend

- Objective: a workspace where the user converses with the agent and sees the framing document,
  stage progress, open questions and delivery slices evolve live.
- ADR impact: ADR 0011 (frontend architecture), on top of ADR 0009 and ADR 0010

#### Steps

- [x] Scaffold `frontend/`: Next.js App Router, TypeScript strict, Tailwind, shadcn/ui, pnpm,
      ESLint, Prettier; every backend shape comes from the generated OpenAPI types.
- [x] Auth.js: login/password page through the backend login bridge, "Sign in with SSO" shown only
      when OIDC is configured (verified e-mail required), sign-out, protected routes; the backend
      login limit is shown as "too many attempts".
- [x] Server-side proxy (route handlers) to the backend: credentials stay server-side, one short
      signed JWT per call, same-origin JSON mutations only, SSE relayed unchanged; CSP headers.
- [x] Sessions page: list, create, rename, archive.
- [x] Session workspace on the lot 6 application API:
  - [x] chat panel with token streaming and status events;
  - [x] document panel: rendered Markdown per stage, version history, diff view;
  - [x] stage stepper (8 stages) with readiness checklist, coverage per field and `stale` markers;
  - [x] open questions panel: answer options as buttons, recommended option highlighted;
  - [x] review bar: approve, reject, request changes, reopen stage;
  - [x] inline field edit and section comments;
  - [x] delivery slicing view: slice cards, dependency graph, waves, contract matrix;
  - [x] export menu (Markdown, JSON, slice specs, backlog JSON).
- [x] Loading, empty and error states (LLM error, 401/403, 409 pending review, 429 rate limit).
- [x] Tests: Vitest + Testing Library for components; Playwright end-to-end against the real backend
      in `fake` LLM mode on SQLite (login, session, streamed turn, document, review, approval).
- [x] 7b: wire the real API (generated OpenAPI types, endpoints and SSE contract from lot 6); the
      in-memory mock backend is removed.
- [x] Frontend lint, type check, tests, build and end-to-end tests in CI and pre-commit; GitHub
      actions pinned by commit SHA.

### Lot 8: Packaging and deployment

- ADR impact: `none` (extends ADR 0005, amendment recorded there)

#### Steps

- [x] Frontend Dockerfile (Next.js standalone output), built and healthy as uid 1000; backend image
      rebuilt multi-stage as uid 10001 with a `/readyz` healthcheck.
- [x] Dev compose: backend, frontend, Postgres, Redis, LiteLLM (Docker work runs on `codex-dev`).
- [x] Prod compose and Caddy: `/api/v1` and `/v1` to the backend, everything else (including
      Auth.js `/api/auth/*` and Next.js route handlers) to the frontend; SSE flushed immediately.
- [x] docker-box Dockhand stack `deploy/docker-box/compose.yaml` (single port 47280, external
      LiteLLM, secrets as stack variables, one-shot migrations and idempotent admin bootstrap).
- [x] Root `README.md`, backend and frontend `.env.template`, validation commands updated;
      `deploy/smoke.sh` end-to-end check and a CI job building the images.
  The frontend login and pages use the real backend since lot 7b.

### Lot 9: Finishing touches

- ADR impact: `none` for the wording and configuration; ADR 0010 and 0011 updated for the
  turn stream keepalive

#### Steps

- [x] Gate questions phrased per field and rule in the session language (French or English),
      with 2 to 4 options, a recommended option and a readable reason; `gate:` ids kept within 36
      characters; no gate question on a field the model already asks about. The fake model uses
      the same wording.
- [x] Assistant messages rendered as Markdown in the chat (raw HTML never interpreted); user
      messages stay plain text.
- [x] `LLM_MAX_TOKENS` defaults to 32768.
- [x] docker-box defaults to `claude-opus-5-5` with a 300-second LLM timeout and a 1800-second
      session lock.
- [x] Turn streams send a `: keepalive` SSE comment every 15 seconds while the turn is silent;
      the frontend proxy relays it and ends a stream only after 60 silent seconds, so slow
      provider calls and their retries are no longer cut by the proxies.

### Later (not scheduled)

- [ ] MCP server exposing session tools (start, answer, document, approve, export slices).
- [ ] Backlog and slice export to GitHub Issues and Linear.
- [ ] OpenWebUI Pipe Function / agent mode, with facade session continuity fixed.
- [ ] Groups / teams and shared sessions.
- [ ] Project-type templates (stage depth presets).

### Validation (every lot)

- [ ] Backend (from `backend/` after lot 0): `uv run ruff format .`, `uv run ruff check .`,
      `uv run ty check src tests`, `uv run pytest -m unit`, `uv run pytest -m integration`,
      `uv run pytest -m end2end`
- [ ] Frontend (lot 7+): `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e`
- [ ] `pre-commit run --all-files`
- [ ] Dead-code pass, docs and `.env.template` in sync, ADR written when required
