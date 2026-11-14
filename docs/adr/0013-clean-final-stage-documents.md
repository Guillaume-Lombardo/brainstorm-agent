# ADR 0013: Clean final stage documents

## Status

Accepted.

## Context

Working documents intentionally expose analysis, readiness and clarification history.
They are useful while framing a stage, but unsuitable as the final project deliverable.
Validation can happen automatically, through human approval, or at the terminal stage
without a next stage. Reopening invalidates prior validation without deleting history.

## Decision

- Keep working rendering unchanged and create one additional immutable `kind=final`
  document version at validation. Persist it in the same transaction as the transition.
- Finalization belongs to `SessionService`, after the deterministic gate and any required
  human approval. The terminal stage also requires approval when that setting is enabled.
  A completed terminal stage can be reopened explicitly and finalized again.
- Define `FinalStageDocument` in domain code: one short prose `overview`, optional subject
  sections for stage artefacts only, then facts, assumptions, decisions, risks and remaining
  open questions. Stage 0/1 governance-like fields fold into those lists; a pitch/problem
  statement supplies the overview. Do not create subject sections that restate governance.
- State each substantive item once. The rewrite merges near-duplicates; the fallback and
  renderer remove exact/normalized duplicates (case, whitespace, Unicode presentation and
  terminal punctuation). Specific governance and artefacts take precedence over generic
  facts. Rich risk/decision records retain details and suppress their bare duplicates.
  Deterministic matching does not infer semantic equivalence between paraphrases.
- Render final Markdown and export titles with a dedicated narrow escaper. Preserve normal
  punctuation while neutralizing active Markdown, HTML, URLs and email autolinks; collapse
  untrusted line breaks so they cannot inject blocks. Benchmark escaping stays unchanged.
- Use the separate versioned `v2/rendering/final-stage-document.md` prompt for one bounded
  structured provider request. Supply only state-derived business content in the session
  language; exclude the analysis summary, transcript, gate metadata and clarifications.
  The prompt forbids inventions, omissions and promotion of assumptions into facts.
- Preserve business references in nested delivery/backlog content, replacing schema keys
  with readable labels. Empty governance sections explicitly state that nothing is recorded.
- Provider errors or invalid output log only an error type and fall back to clean content
  built from that same state and schema. No repair request or retry delays validation.
  Fake mode returns the source schema without network access.
- Add a non-null string `documents.kind` with a `working` server default. Migration 0004
  backfills old versions without reinterpreting analysis dumps as final documents.
- Export only validated, non-stale stages in canonical order, preferring their latest final
  version. Omit in-progress stages so the framing document is ready to share; JSON retains
  all versions and review history. Legacy validated stages without final versions receive
  a deterministic clean rendering at export time, without mutating history or calling a model.
- Show `Final` alongside the version number in the frontend selector.

## Consequences

Validation adds one provider request, bounded by existing timeout and token settings; normal
turns incur no added request. A rendering failure cannot veto a valid transition. Rewrites
remain subject to model faithfulness: typed validation checks shape, not semantic equivalence.
All original state and working versions remain available in JSON for audit and comparison.
The lock budget includes finalization: strictly more than four provider timeouts, or six
with challenge findings. Default lock values are 210 seconds for 30-second calls and
840 seconds for 120-second production calls. docker-box retains 1800 seconds for 300-second
calls with challenge off; findings requires more than 1800 seconds (for example 2100).
No environment variables are added. The overview is internal provider content; persisted
Markdown and the public document API retain their existing shapes.

## Alternatives

Replacing every working document would lose useful diagnostics and add per-turn latency.
Export-time rewriting would add repeated calls and make exports unstable. Reusing analysis
summaries would preserve turn history. Persisting a final kind separately avoids all three.
