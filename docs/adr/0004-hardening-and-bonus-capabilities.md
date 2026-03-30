# 0004 - Hardening and bonus capabilities

## Status

Accepted

## Context

The backend already delivered the core staged brainstorming workflow and a minimal OpenAI-compatible facade.
To support external clients such as LiteLLM or future OpenWebUI integrations more safely, the service also needs:

- optional authentication
- basic runtime observability
- explicit human validation before transition when required
- export endpoints for downstream consumption
- broader OpenAI-compatible coverage
- streaming-friendly transport endpoints

These concerns should not weaken the deterministic stage engine or push workflow logic into the HTTP layer.

## Decision

We add hardening and bonus capabilities as thin layers around the existing application service:

1. Authentication remains optional and environment-driven through API keys.
2. Observability stays in-process with request IDs, richer health output, and lightweight metrics.
3. Human validation is modeled as a pending transition stored in session state plus persisted review decisions.
4. Exports are generated from persisted session state and versioned documents.
5. `/v1/responses` is implemented as another facade shape over the same session service.
6. Streaming is implemented as SSE transport that emits final turn payloads once processing completes.

## Consequences

### Positive

- Backward compatibility is preserved by default.
- External clients can use either native session endpoints or OpenAI-compatible endpoints.
- Human review becomes explicit without complicating the LangGraph turn graph.
- Exports and metrics improve operational readiness.

### Negative

- Persistence schema grows without a formal migration tool yet.
- Streaming is transport-level only and not true token streaming.
- Metrics are process-local and not durable across restarts.

## Alternatives considered

### Push human review into LangGraph

Rejected because it would complicate the synchronous turn graph and blur the line between deterministic orchestration and workflow governance.

### Add a full Prometheus or OpenTelemetry stack now

Rejected for this iteration because the current need is bounded operational visibility, not full observability infrastructure.

### Replace the native API with only OpenAI-compatible endpoints

Rejected because the native session API is clearer for first-party clients and better matches the domain model.
