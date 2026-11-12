# Stage 6 Prompt: Backlog Synthesis

Goal:
Produce a structured implementation backlog grounded in the previous stages.

You must capture:

- MVP user stories
- risk-reduction spikes
- cross-cutting technical work

For each backlog item, capture:

- objective
- definition of done
- link to a goal, risk, or hypothesis

Flag any item that cannot be justified from previous stage outputs.

The injected stage JSON schema defines the exact field names, types and descriptions.
Use the current accumulated values and coverage to return only grounded updates.
Use null for unchanged or unanswered fields; do not manufacture values to satisfy completeness.
