# ADR 0003: OpenAI-compatible facade for LiteLLM and external clients

## Status

Accepted

## Context

The backend exposes a stateful business API centered on sessions and staged brainstorming turns.
That API is suitable for direct integration, but LiteLLM and many external clients expect an OpenAI-compatible surface such as:

- `GET /v1/models`
- `POST /v1/chat/completions`

Without a compatibility layer, the backend cannot be registered as a model-like target behind a LiteLLM proxy.

## Decision

Add a narrow OpenAI-compatible facade to the existing backend:

- `GET /v1/models` exposes a stable public alias
- `POST /v1/chat/completions` translates an OpenAI-style request into one brainstorming turn

Key facade rules:

- the public model alias is configured through `OPENAI_FACADE_MODEL_NAME`
- continuity is carried through `metadata.session_id`
- if `metadata.session_id` is missing, a new brainstorming session is created automatically
- the response remains OpenAI-compatible, with an additional `brainstorm` object carrying session and stage metadata
- the active assistant payload returned in `choices[0].message.content` is built from the backend assistant message plus the current Markdown deliverable

## Consequences

### Positive

- LiteLLM can target the backend as an OpenAI-compatible upstream
- generic OpenAI clients can call the brainstorming backend with minimal adaptation
- the original business API remains intact for first-party integrations

### Negative

- the facade is not a full general-purpose OpenAI implementation
- session continuity depends on clients preserving `metadata.session_id`
- streaming and `/v1/responses` are still future work

## Alternatives Considered

### Replace the business API with only OpenAI-compatible routes

Rejected because the session-centric business API is still the clearest surface for first-party integrations and administration.

### Implement a stateless chat facade derived only from `messages[]`

Rejected because the product requirement is persistent, reentrant, and stateful conversation management.
