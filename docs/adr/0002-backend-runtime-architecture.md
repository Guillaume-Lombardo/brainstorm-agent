# ADR 0002: Backend runtime architecture for the structured brainstorming service

## Status

Accepted

## Context

The product requires a persistent backend with:

- a strict ordered stage workflow
- OpenAI-compatible model access
- deterministic transition checks
- HTTP delivery for external clients
- persistent session and document storage

The implementation must avoid mixing transport, orchestration, domain rules, and persistence.

## Decision

Adopt a layered runtime architecture with these boundaries:

- `api/`: FastAPI routes, dependency wiring, HTTP schemas
- `core/`: enums, domain schemas, stage contracts, deterministic validators
- `graph/`: LangGraph orchestration for one conversation turn
- `services/`: prompt loading, LLM adapters, Markdown rendering, session application service
- `persistence/`: SQLAlchemy models, session factory, repositories
- `settings/`: environment-backed application settings

Key runtime decisions:

- Use LangGraph for turn orchestration, with one graph covering extraction, contradiction challenge, rule validation, Markdown rendering, and transition decision.
- Keep stage-transition authority in code-level validators, not in LLM text alone.
- Store critical state in SQLAlchemy/Postgres-compatible tables.
- Use Redis only for optional session locking and coordination.
- Keep prompts externalized as packaged resources under `src/brainstorm_agent/resources/prompts/v1/`.
- Provide a heuristic LLM mode for tests and local dry runs, while production mode remains OpenAI-compatible.

## Consequences

### Positive

- The backend is testable without a live LLM provider.
- Runtime responsibilities stay explicit and reviewable.
- External integrations can rely on a stable HTTP/API surface.
- Prompt evolution remains versionable.

### Negative

- The codebase has more modules and orchestration glue than a minimal prototype.
- The heuristic mode is intentionally limited and should not be treated as production-quality reasoning.

## Alternatives Considered

### Single service layer without LangGraph

Rejected because the brief explicitly requires a real state graph rather than a linear `if/else` loop.

### Redis-backed critical session state

Rejected because critical state must remain durable and reentrant across restarts.
