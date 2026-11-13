# ADR 0007: Typed stage contracts and structured outputs

- Status: Accepted
- Date: 2026-11-13

## Context

Free-form conversations must accumulate grounded stage state. Previously the field list,
validation and provider output disagreed, each turn replaced state, and a heuristic filled pitch
ambiguities without user evidence.

## Decision

One strict Pydantic field model per stage defines field types, descriptions and gate-required
metadata. Gate field lists and provider JSON schemas derive from these models. Nullable fields
represent unchanged patch values; required business completeness is evaluated after server merge.
Identified collections merge by id, questions resolve explicitly by id. Scalar and simple string
list fields replace only when supplied. Backlog entries and risk fields have stable ids.

Use AsyncOpenAI with strict JSON schema by default. Explicit json_object and tool modes support
providers without strict schemas. Retry malformed structured output once with its validation error;
reject a second failure before persisting any turn. Disable transport retries to bound lock duration.
The session lock TTL must exceed three call timeouts, or five with the optional findings challenge.

Separate structured analysis from conversational reply streaming. A challenge may append findings
but cannot replace business values. Deterministic gates remain authoritative. Context includes
current values/coverage, a bounded transcript and previous-stage summaries. Provider usage,
including retries and replies, is stored with turn ids in session JSON, requiring no SQL migration.
The fake adapter supports scripted analysis and explicit field fixtures without making network calls.

Prompt v2 preserves v1. Generated content follows the user's language; schema keys and Markdown
headings remain English. The Markdown prompt is a template consumed by the deterministic renderer.

## Consequences

The former heuristic mode is replaced by explicit fake mode. Production defaults to openai.
Clients must preserve ids in updates. Existing HTTP streaming envelopes remain unchanged; the
provider reply iterator is ready for the later typed event-stream API. Strict provider capabilities
must be selected by configuration; there is no silent fallback on network or provider errors.

Provider adapters require explicit routing and credentials before construction. The session
service owns production transports and closes them inside the turn event loop. Historical usage
remains in session JSON to preserve counters without coupling this lot to schema migrations;
its size grows linearly with turns.

New question ids are server-owned UUIDs, preventing provider aliases such as q1 from colliding
with global SQL primary keys across sessions or stages. Updates reuse the current server id.

## Lot 2: Declarative quality gates and elicitation

Domain `Rule` records pair stable rule ids with predicates and rejection messages. A stage-keyed
registry allows later stages to add rules without changing the validation engine. Field coverage
is derived in code: empty values and explicit placeholders are missing; only present values may
be partial, with a provider reason. Provider proposals use a closed-object list of field/reason
records for strict JSON-schema compatibility; domain state converts them to a lookup. Conditional
stage requirements also demand clear coverage. Readiness combines required clear fields, registered rules,
all open blocking questions and explicit contradictions. Provider approval never overrides it.
The optional contradiction challenge now supplies blocking findings rather than advisory uncertainty.

The checklist and coverage are returned to clients and rendered deterministically, including
passed/total. Cross-stage rules consume serialized field snapshots: impact actors must exist in
stage 1, MVP backlog capabilities in stage 2, and links in an explicit reference catalog. Goal and
hypothesis references derive from stage/field/index; risk references use stable item ids. Upstream
list replacement can change reference meaning; editing/reopening earlier stages and downstream
staleness remain lot 6 concerns. Backlog objective, definition of done and traceability are checked
in code; optional EARS criteria use an explicit syntactic contract.

Full questions persist; presentation selects three by scope, security/compliance, UX, technical.
The reply receives that same selection. Failed requirements generate actionable questions in code.
Provider reply wording remains bounded by instructions; the structured question budget is enforced
in code. Resolution ids record the current user answer with a server timestamp in Clarifications.
New metadata persists in session JSON, preserving compatibility without SQL migrations.

D5 uses an explicit allowlist of non-critical analytical gaps. Defaults remain assumptions marked
to confirm and never populate fields, including when a provider proposes a critical default.
Numeric targets, a minimum pitch length and placeholder rejection provide deterministic structural
specificity checks; they cannot certify the truth or full semantic consistency of free text.
