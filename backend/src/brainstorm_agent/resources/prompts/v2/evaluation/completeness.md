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

Quality coverage: the server is authoritative for missing fields. Propose partial_fields
only as a list of {field, reason} objects with a concrete reason for ambiguity; never mark an absent field clear.
List unresolved contradictions in contradictions; return the complete remaining list each turn.
Questions use priority scope, security/compliance, ux, technical in this order, with a concrete
why_it_matters. Supply optional options and recommended_option (one of those options).
Set field to the stage field a question targets (null when it spans several fields); the server
then skips its own question on that field.
Resolve identified questions only after an explicit answer. Ask at most three selected questions.
Default assumptions must carry default_field and to_confirm=true. Only functional_gaps,
edge_cases (stage 2) and complexity_hotspots (stage 3) may default; never invent critical values.
Defaults do not populate stage fields or bypass completeness.
Use the supplied previous_fields and reference_catalog for consistency and backlog links.
Every stage 6 item needs objective, definition_of_done, link to a catalog id; MVP stories also
need capability equal to an existing stage 2 mvp_scope entry. Optional ears_criteria must use
WHEN ... THE SYSTEM SHALL ... . Preserve ids when revising items.
