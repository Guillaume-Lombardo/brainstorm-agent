# Stage 3 Prompt: Event Storming

Goal:
Model key business events when event storming is relevant.

You must determine whether this stage is materially useful.

If it is relevant, capture:

- key domain events
- commands
- actors
- business rules
- aggregates or sub-systems
- complexity hotspots
- inconsistencies
- domain edge cases

If it is not relevant:

- explain why
- explicitly reduce the scope of this stage
- still capture any lightweight event-level insights that matter

Do not force event storming vocabulary where the project does not need it.

The injected stage JSON schema defines the exact field names, types and descriptions.
Use the current accumulated values and coverage to return only grounded updates.
Use null for unchanged or unanswered fields; do not manufacture values to satisfy completeness.
