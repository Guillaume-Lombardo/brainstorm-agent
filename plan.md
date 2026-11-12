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
  - transition validation only checks field presence;
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

- [ ] Move `src/`, `tests/`, `migrations/`, `alembic.ini`, `pyproject.toml`, `uv.lock`, `ruff.toml`,
      `.python-version`, `Dockerfile`, `docker/` and the backend env files to `backend/`.
- [ ] Keep at the root: `AGENTS.md`, `agent.md`, `SKILLS.md`, `skills/`, `docs/`, `deploy/`, compose
      files, `.github/`, `.pre-commit-config.yaml`, `README.md`, `plan.md`, license and community
      files.
- [ ] Merge the duplicated `.env.example` / `.env.template` into one backend `.env.template`.
- [ ] Update CI (working directory, path filters per app), pre-commit hooks, compose build contexts,
      prompt base path defaults.
- [ ] Update `AGENTS.md` (layout, pre-PR checklist commands), `README.md` (root overview + backend
      section), local skills that reference paths.
- [ ] All existing checks green from `backend/`.

### Lot 1: Make the agent loop work with a real OpenAI-compatible model

- Objective: a free-form conversation through LiteLLM can complete every stage, with the state
  accumulating across turns and strict, typed LLM outputs.
- ADR impact: `required` (`docs/adr/0007-typed-stage-contracts-and-structured-outputs.md`)

#### Steps

- [ ] Replace `extracted_fields: dict[str, Any]` with one Pydantic model per stage; the model is the
      single source for required fields, field descriptions, the prompt field list, validation and
      the JSON schema sent to the LLM.
- [ ] Request structured outputs (`response_format` JSON schema, strict) generated from those models;
      add a configurable fallback (`json_object` or tool calling) for models without schema support
      (to verify for `glm-5.3-flash`).
- [ ] On schema or JSON failure, retry once with the validation error fed back; then return an
      actionable error (no silent partial state).
- [ ] Patch semantics: the LLM returns field updates, new items and resolved item ids; the server
      merges them into the accumulated stage state. Stable ids for facts, assumptions, decisions,
      risks, questions and backlog items across turns.
- [ ] Prompt context: stage contract (fields + descriptions), current accumulated values and
      coverage, last N transcript turns, compact summaries of previous stages (no full session JSON
      dump).
- [ ] Split the turn into a bounded structured analysis call and a conversational reply call that
      can be streamed; the contradiction challenge becomes an optional pass returning findings only
      (`LLM_CHALLENGE_PASS=off|findings`).
- [ ] Async LLM client and turn processing (`AsyncOpenAI`).
- [ ] Remove canned stage-0 fillers; the heuristic adapter becomes an explicit deterministic test
      double (`LLM_MODE=fake`, scripted responses); `openai` becomes the documented default.
- [ ] New prompt folder `v2` with the field lists and output contracts.
- [ ] Real token usage from the LLM response in turn records and in the OpenAI-compatible facade.
- [ ] Settings validation: session lock TTL greater than the worst-case turn duration.
- [ ] Use or delete the unused Markdown rendering prompt.
- [ ] LiteLLM example config with the `claude-opus-5-5` and `glm-5.3-flash` aliases.
- [ ] Contract tests with recorded LLM responses (valid, invalid JSON, schema mismatch, partial
      patch, retry path).

### Lot 2: Quality gates and elicitation (patterns from Spec Kit, Rasa CALM, Kiro)

- Objective: the gate blocks vague or contradictory answers through code, and each turn asks few,
  prioritized questions.
- ADR impact: `required` (declarative stage rules; extend ADR 0007)

#### Steps

- [ ] Coverage taxonomy: each stage field is `clear | partial | missing`; code is authoritative for
      `missing`, the LLM proposes `partial` with a reason.
- [ ] Declarative stage rules with rejections (condition + message), e.g.:
  - [ ] measurable objectives contain a metric or a target value;
  - [ ] at least 3 risks across at least 2 categories, no generic mitigation (`TBD`, empty);
  - [ ] MVP scope items exist in the capability list;
  - [ ] every backlog item links to an existing goal, risk or hypothesis id;
  - [ ] stage 3 "not relevant" requires a justification (migrate the existing rule).
- [ ] Readiness checklist per stage, rendered in the stage document (`passed/total`).
- [ ] Question budget: at most 3 questions per turn, prioritized (scope > security/compliance > UX >
      technical), each with `why_it_matters`, optional answer options and a recommended option.
- [ ] Default assumptions for non-critical gaps (D5), flagged and listed for confirmation.
- [ ] Timestamped `Clarifications` log (question -> answer) in each stage document.
- [ ] Cross-stage consistency checks (impact-map actors vs stage 1 actors, backlog vs MVP scope).
- [ ] Stage 6 backlog items carry objective, definition of done, link, and optional EARS acceptance
      criteria ("WHEN ... THE SYSTEM SHALL ...").
- [ ] Deterministic unit tests for every rule and for the transition decision table.

### Lot 3: Evaluation harness

- Objective: measure whether the agent blocks and advances correctly, per model, before UI work
  depends on it.
- ADR impact: `none`

#### Steps

- [ ] Golden scenarios in YAML: persona, hidden project facts, scripted or simulated answers, and
      expectations (must block at stage X, must flag contradiction Y, must reach the last stage).
- [ ] Simulated user driven by an LLM playing the persona with only its hidden facts.
- [ ] Rubric-based LLM judge for document quality (specificity, traceability, no invented facts).
- [ ] `brainstorm-agent eval` CLI with a report per model (D6): transition precision/recall, turns
      per stage, schema failures, latency, token cost.
- [ ] Default runs on `glm-5.3-flash`; `claude-opus-5-5` for the strong reference and the judge.
- [ ] CI runs the recorded-fixture subset only; full evaluation runs on demand.

### Lot 4: Stage 7, Delivery slicing

- Objective: the final deliverable splits the product into vertical slices that can be developed in
  parallel and tested in integration.
- ADR impact: `required` (`docs/adr/0008-delivery-slicing-stage.md`; canonical workflow change)

#### Steps

- [ ] Add `stage_7_delivery_slicing` to the `Stage` enum and ordering (stages are stored as strings:
      no schema migration).
- [ ] Update the canonical workflow in `AGENTS.md`, `README.md`, `skills/brainstorm-workflow` and the
      ADR index.
- [ ] Typed stage model:
  - [ ] slice 0 "walking skeleton": cross-cutting foundation and shared contracts (API schemas,
        events, shared data model);
  - [ ] per slice: goal, backlog item ids, owned domain (from stage 3 aggregates/sub-systems),
        provided and consumed contracts, dependencies, integration scenarios (Given/When/Then or
        EARS), stubs needed to work without the other slices;
  - [ ] delivery waves derived from the dependency graph.
- [ ] Stage prompt (`v2/stages/stage-7-delivery-slicing.md`) built from the story map backbone
      (stage 2), event storming (stage 3) and impact map (stage 4).
- [ ] Deterministic rules:
  - [ ] every MVP backlog item belongs to exactly one slice;
  - [ ] the dependency graph is acyclic;
  - [ ] every contract has exactly one owning slice and every consumed contract exists;
  - [ ] every slice has at least one integration scenario;
  - [ ] cross-cutting work is assigned to slice 0.
- [ ] Rendering: slice table, waves, contract matrix, one spec section per slice.
- [ ] Export: one Markdown spec per slice and a backlog JSON with dependencies and waves (usable as
      parallel work lots).
- [ ] Evaluation scenarios extended to stage 7.

### Lot 5: Users, authentication and ownership

- Objective: multi-user backend with login/password and optional OIDC (D1).
- ADR impact: `required` (`docs/adr/0009-user-authentication.md`)

#### Steps

- [ ] `users` table (email, display name, Argon2id password hash, OIDC issuer + subject, active
      flag, timestamps) with an Alembic migration.
- [ ] `owner_id` on sessions with a migration assigning existing sessions to a bootstrap user.
- [ ] Authorization check on every session route (owner only); existing API-key auth kept for
      service clients (OpenAI-compatible facade).
- [ ] Recommended flow (to confirm in the ADR): Auth.js in Next.js with a Credentials provider
      (verified against the backend) and an OIDC provider enabled only when configured; the Next.js
      server calls the backend with a short-lived signed JWT (`sub` = user id) using the existing JWT
      mode; OIDC users are linked or provisioned by issuer + subject.
- [ ] Login throttling with the existing rate limiter.
- [ ] CLI: `user create`, `user set-password`, `user disable`.
- [ ] Tests: password hashing, login success/failure, OIDC linking, ownership isolation between two
      users.

### Lot 6: Application API and event stream

- Objective: a stable, typed contract for the Next.js frontend.
- ADR impact: `required` (`docs/adr/0010-application-api-and-event-stream.md`)

#### Steps

- [ ] Typed SSE event stream per turn: `turn.started`, `analysis.status`, `message.delta`,
      `document.updated`, `coverage.updated`, `stage.changed`, `review.required`, `turn.completed`,
      `error`; documented in OpenAPI.
- [ ] `GET /sessions` (paginated, owner-scoped), `PATCH /sessions/{id}` (title, archive), soft
      delete.
- [ ] Reopen an earlier stage with `stale` propagation to downstream stages (D4).
- [ ] Direct edits: `PATCH` stage field values or items from the UI, then re-validate; comments on a
      document section feed the next turn.
- [ ] Review endpoint: approve, reject, request changes with a note.
- [ ] Document version diff endpoint.
- [ ] Final consolidated framing document export, slice specs and backlog JSON export.
- [ ] CORS settings; OpenAPI-to-TypeScript generation script for the frontend.
- [ ] Integration tests for reopen/stale, edits, event order; end-to-end SSE test.

### Lot 7: Next.js frontend

- Objective: a workspace where the user converses with the agent and sees the framing document,
  stage progress, open questions and delivery slices evolve live.
- ADR impact: covered by ADR 0009 and ADR 0010

#### Steps

- [ ] Scaffold `frontend/`: Next.js App Router, TypeScript strict, Tailwind, shadcn/ui, pnpm,
      ESLint, Prettier, generated API types.
- [ ] Auth.js: login/password page, "Sign in with SSO" shown only when OIDC is configured, sign-out,
      protected routes.
- [ ] Server-side proxy (route handlers) to the backend: credentials stay server-side, SSE relayed.
- [ ] Sessions page: list, create, rename, archive.
- [ ] Session workspace:
  - [ ] chat panel with token streaming and status events;
  - [ ] document panel: rendered Markdown per stage, version history, diff view;
  - [ ] stage stepper (8 stages) with readiness checklist, coverage per field and `stale` markers;
  - [ ] open questions panel: answer options as buttons, recommended option highlighted;
  - [ ] review bar: approve, reject, request changes, reopen stage;
  - [ ] inline field edit and section comments;
  - [ ] delivery slicing view: slice cards, dependency graph, waves, contract matrix;
  - [ ] export menu (Markdown, JSON, slice specs, backlog JSON).
- [ ] Loading, empty and error states (LLM error, 401/403, 409 pending review, 429 rate limit).
- [ ] Tests: Vitest + Testing Library for components; Playwright end-to-end against the backend in
      `fake` LLM mode, including login.
- [ ] Frontend lint, type check, tests and build in CI and pre-commit.

### Lot 8: Packaging and deployment

- ADR impact: `none` (extends ADR 0005)

#### Steps

- [ ] Frontend Dockerfile (Next.js standalone output).
- [ ] Dev compose: backend, frontend, Postgres, Redis, LiteLLM (Docker work runs on `codex-dev`).
- [ ] Prod compose and Caddy: `/` to the frontend, `/api` to the backend.
- [ ] Root `README.md`, backend and frontend `.env.template`, validation commands updated.

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
