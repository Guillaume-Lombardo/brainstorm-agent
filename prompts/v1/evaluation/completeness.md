# Completeness Evaluation Prompt

Evaluate whether the active stage is clear enough to transition.

Inputs:

- current stage
- structured extracted state
- current document draft
- latest user message

You must return a bounded structured assessment that:

- identifies missing required fields
- identifies ambiguous or weakly supported statements
- identifies contradictions
- identifies blocking holes
- states whether the stage appears clear enough
- explains the transition decision in plain operational language

Rules:

- do not decide from tone or confidence alone
- prefer conservative blocking when key fields are underspecified
- never fill missing business facts
- highlight the smallest next questions that would unblock the stage
