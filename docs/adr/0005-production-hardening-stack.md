# 0005 - Production hardening stack

## Status

Accepted

## Context

The backend already supports the core brainstorming workflow, OpenAI-compatible facade routes, SSE transport, and optional human validation. To move toward real deployment, it still needs:

- formal schema migrations
- stronger authentication than plain API keys
- predictable throttling
- clearer readiness and metrics behavior
- deployment assets for the surrounding model/UI stack

## Decision

We introduce a production hardening stack with five parts:

1. Alembic becomes the formal schema migration path.
2. Authentication supports hashed API keys, JWT bearer tokens, or a hybrid mode.
3. Rate limiting is implemented as a configurable fixed-window limiter backed by Redis when available.
4. Operational endpoints are expanded with readiness/liveness semantics and richer metrics.
5. Production deployment examples include the backend, LiteLLM, OpenWebUI, and a reverse proxy.

## Consequences

### Positive

- Persistent environments can upgrade schema safely without relying on `create_all()`.
- Security posture improves through hashed credentials and bearer-token support.
- Throttling and metrics make the service safer to expose externally.
- LiteLLM and OpenWebUI integration is documented in deployable form.

### Negative

- Configuration surface grows substantially.
- JWT support is intentionally simple and does not replace a full identity provider.
- Rate limiting is fixed-window and not a full distributed policy engine.

## Alternatives considered

### Keep `create_all()` as the only schema mechanism

Rejected because schema drift and production upgrades become unsafe.

### Delegate all auth and throttling to an upstream proxy

Rejected because the service still needs a sane default security posture when deployed without a full API gateway.

### Add full OpenTelemetry plus external collectors immediately

Rejected for this iteration because Prometheus-style metrics and readiness checks provide enough operational value for the current deployment scope.
