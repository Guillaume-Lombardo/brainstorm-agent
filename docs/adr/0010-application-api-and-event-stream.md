# ADR 0010: Application API and event stream

- Status: Accepted
- Date: 2026-11-13

## Context

The Next.js workspace needs a stable contract for session management, incremental turns,
document editing and review. Authentication and tenant isolation already belong to the session
service (ADR 0009); stage validation belongs to the domain (ADR 0007 and lot 2).

## Decision

Keep legacy message and export endpoints compatible. Add an application router under
`/api/v1/sessions`, delegating every operation to the same owner-only service.

Session title, archive, soft deletion, section comments and downstream stale markers use additive
fields in the existing JSON state. Existing rows acquire defaults when deserialized; no relational
migration is needed. Deleted sessions return 404 on every access path and are excluded from lists.
Pagination uses offset/limit with a deterministic creation-time/id order.

Only earlier visited stages may be reopened. This clears pending review and marks every visited
downstream stage stale. Direct edits require the active stage, replace supplied field values or
item collections, run the shared deterministic gate and create an immutable document version.
Edits never advance the workflow. Complete edits rebuild pending human review when configured.
Blocking questions cannot be removed through direct edits; they require a conversational answer.
Unchanged values retain partial-coverage findings. Section comments enter the next analysis context and are marked
consumed only when that turn commits.

The turn endpoint streams named SSE events containing discriminated JSON payloads:
`turn.started`, `analysis.status`, `message.delta`, `document.updated`, `coverage.updated`,
optional `stage.changed` and `review.required`, then `turn.completed`.
A dedicated worker thread owns each turn's synchronous SQL/Redis operations and provider loop,
relaying events to the HTTP loop without blocking other requests.
Failures terminate with a sanitized `error`. Deltas come from the conversational provider stream
and remain tentative until commit. Cancellation of the stream generator cancels its turn task. Transport disconnect detection is
best effort; a turn already entering persistence can commit in full after a disconnect. There is no event replay,
Last-Event-ID recovery or automatic retry contract. HTTP authorization and pending-review errors
occur before stream headers; runtime failures use the terminal error event.

Coverage, readiness, question priorities/options and clarifications reuse the lot 2 models.
The OpenAPI SSE response references the discriminated event union. The generated snapshot and
TypeScript are committed under `frontend/src/lib/backend/generated/`; `pnpm generate:api`
regenerates both without starting an HTTP server. The mock UI keeps its presentation types where
the shapes differ; real HTTP wiring is lot 7b.

Consolidated Markdown and JSON exports remain available. Backlog JSON and slice specifications delegate to the delivery export functions introduced in
lot 4. Backlog exports include effective dependencies, full items and delivery waves; slice specs
map safe filenames to Markdown. Missing, invalid or stale delivery plans return 409.
CORS is disabled by default and accepts an explicit configured origin allowlist.

## Consequences

Application authorization stays centralized and routes contain transport mapping only.
JSON additions avoid a migration while preserving persistent annotations across restarts.
Offset pagination can shift under concurrent creation; consumers should refresh lists.
SSE consumers must discard tentative content after a terminal failure.
