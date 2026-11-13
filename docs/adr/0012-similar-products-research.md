# ADR 0012: Optional sourced product benchmark

- Status: Accepted
- Date: 2026-11-13

## Context

Framing benefits from existing product evidence without inventing business answers or changing
stage gates. Users explicitly trigger research from stage 1 and choose which features to retain.

## Decision

A SearchProvider protocol returns normalized title, URL, snippet and provider. SEARCH_PROVIDER
selects none (application default), searxng (deployment), tavily, brave, litellm, or fake (fake LLM
only). Startup validates required URLs and credentials. Each HTTP call has a timeout, response
size limit, result and snippet bounds, and refuses redirects. Only configured search endpoints
are contacted: result pages are never fetched. The private SearXNG endpoint is intentional.

The model generates 3–5 queries from typed stage 1 fields and synthesizes the actual snippets.
Prompts are versioned under v2/research. Code removes products and candidate features without
nonempty evidence from actual results; feature product references must resolve. This establishes
provenance, not independent verification of a snippet's claims. Deductions and recommendations
remain hypotheses. Search results are untrusted prompt data, never executable instructions.

Benchmark executions are versioned in their own table, with 36-character UUID ids and a per-session
version constraint. Owner-only application service methods reuse session authorization and locking.
A dedicated worker keeps synchronous SQL and Redis acquisition off the HTTP event loop.
A global research deadline uses 80% of the configured lock lease, reserving time for persistence.
SSE communicates execution and terminal outcomes; disconnects do not automatically apply choices.
Selection targets the latest execution; stale or unknown feature ids are rejected. Each execution
and selection creates a stage 1 document version. Benchmark selections are explicit decisions and
candidate context for stage 2; they never populate stage fields or change the completeness gate.
Markdown and JSON exports include the benchmark and evidence history.

SearXNG has no published port and uses a repository settings file with JSON enabled, three general
engines and an internal-use disabled limiter. Its secret comes from stack environment variables.
The deployment orchestrator provisions the production secret before merging.

## LiteLLM contract checked

The [v1.106.1 endpoint implementation](https://github.com/BerriAI/litellm/blob/v1.106.1/litellm/proxy/search_endpoints/endpoints.py)
accepts POST /v1/search (also /search), with search_tool_name in the JSON body, query and max_results.
It also supports /search/{search_tool_name}. Responses contain results with title, url and snippet.
The adapter uses the body variant and a separately configurable endpoint and API key.
The [official search documentation](https://docs.litellm.ai/docs/search) describes the unified
Perplexity-compatible contract; the tagged source fixes the contract to the deployed version.

## Consequences

Search can disclose framing terms to the selected provider; it always requires an explicit action.
A rerun starts with no selected features. Prior versions remain inspectable in history and exports.
Availability and quality of third-party snippets vary; no live engine result is guaranteed.

Untrusted synthesis text is escaped before Benchmark Markdown rendering. The shared frontend
Markdown renderer refuses images, including any reflected through a later model reply, so viewing
a document cannot issue remote image requests containing framing data.

## Streaming and structured output compatibility

Research query generation and synthesis use the same bounded structured adapter as turns, including
`LLM_OUTPUT_MODE=json_object`, an explicit output schema in each prompt, and typed validation with one repair attempt. Production retains the
JSON-object default from PR #26; research does not request strict grammars independently.

Research streams send `: keepalive` comments every 15 seconds of silence, including query planning
and synthesis. They use the shared frontend SSE relay and its 60-second idle timeout from ADRs
0010/0011. Heartbeats do not restart or duplicate work, and stop at completion or error.
