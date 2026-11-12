# ADR 0006: Monorepo application layout

- Status: Accepted
- Decision: D2, roadmap v2 lot 0

## Context

The Python service needs an application boundary before adding the Next.js
frontend in lot 7. This restructuring must preserve runtime behavior.

## Decision

Move Python source, tests, migrations, Alembic and Python tooling configuration,
lockfile, Dockerfile, entrypoint and backend environment template into
`backend/` using Git moves. Reserve `frontend/` for lot 7 without scaffolding it.

Keep governance, documentation, local delivery skills, CI, Compose and deployment
at the root. Keep `examples/` there: LiteLLM and OpenWebUI examples connect
multiple services and are mounted by root Compose files.

Merge the identical backend env examples into `backend/.env.template`.
Development Compose reads the template; production reads `backend/.env`.
The OpenWebUI env example remains separate because it configures another service.

Python commands run from `backend/`. Root pre-commit hooks explicitly select
that project. CI detects changes per application, runs backend commands in
`backend/`, and runs repository-wide hooks separately for every PR.
Release builds run in `backend/` and upload `backend/dist/`.

Docker retains the root build context and explicitly selects
`backend/Dockerfile` so it can copy the canonical root license.
A small backend README and a matching license copy make Python source
distributions self-contained; the root README and LICENSE remain canonical.
The backend license copy must stay synchronized with the root license.

Default prompts use package resources and need no path change. Relative prompt
overrides and local env files still resolve from the runtime working directory.
Alembic's location relative to the Python source remains unchanged.

Selected test suites do not enforce a whole-application coverage threshold.
CI enforces the unchanged 80% threshold in a dedicated full-suite run instead;
the integration suite alone otherwise exits nonzero despite all tests passing.

Distribution metadata is explicitly 2.4: current isolated Hatchling defaults
to 2.5, which the locked Twine validator rejects. This preserves release
validation without changing runtime dependencies.

## Consequences

No API, schema, stage rule, provider or persistence behavior changes.
Contributors must enter `backend/` for Python commands; deployment commands
remain at the root. Existing root env files must be moved to `backend/.env`.
The root Docker context is filtered to exclude local secrets and build caches.

## Alternatives

Keeping Python at the root would blur app ownership. Moving deployment and
examples into the backend would couple shared integrations to one application.
