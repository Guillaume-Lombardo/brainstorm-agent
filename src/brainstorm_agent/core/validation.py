"""Rule-based validation for stage transitions."""

from __future__ import annotations

from brainstorm_agent.core.enums import Stage
from brainstorm_agent.core.models import OpenQuestionItem, StageValidationResult
from brainstorm_agent.core.stage_contracts import STAGE_CONTRACTS

MINIMUM_RISK_ITEMS = 3


def _is_present(value: object) -> bool:
    """Return whether a field value should count as present.

    Args:
        value: Raw extracted field value.

    Returns:
        bool: `True` when the value is materially present.
    """
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, list | tuple | set):
        return any(_is_present(item) for item in value)
    if isinstance(value, dict):
        return any(_is_present(item) for item in value.values())
    return True


def validate_stage(
    *,
    stage: Stage,
    extracted_fields: dict[str, object],
    open_questions: list[OpenQuestionItem],
) -> StageValidationResult:
    """Validate a stage using coded rules.

    Args:
        stage: Active stage to validate.
        extracted_fields: Structured fields extracted for the stage.
        open_questions: Current open questions for the stage.

    Returns:
        StageValidationResult: Rule-based completeness decision.
    """
    contract = STAGE_CONTRACTS[stage]
    missing_fields = [
        field_name
        for field_name in contract.required_fields
        if not _is_present(extracted_fields.get(field_name))
    ]
    blocking_questions = [item for item in open_questions if item.blocking]
    blocking_reasons = [f"Missing required field: {field_name}" for field_name in missing_fields]

    if stage is Stage.STAGE_3_EVENT_STORMING and not missing_fields:
        relevant = str(extracted_fields.get("event_storming_relevant", "")).lower()
        if relevant in {"false", "no", "0"} and not _is_present(extracted_fields.get("not_relevant_reason")):
            blocking_reasons.append("Event storming irrelevance must be justified explicitly.")
        if relevant in {"true", "yes", "1"} and not _is_present(extracted_fields.get("domain_events")):
            blocking_reasons.append("Relevant event storming requires domain events.")

    if stage is Stage.STAGE_5_RISK_STORMING:
        risks = extracted_fields.get("risks_by_category", [])
        if not isinstance(risks, list) or len(risks) < MINIMUM_RISK_ITEMS:
            blocking_reasons.append("Risk storming needs at least three concrete risk items.")

    if blocking_questions:
        blocking_reasons.append("Blocking questions remain open.")

    stage_is_clear_enough = not blocking_reasons
    if stage_is_clear_enough:
        reason = "All coded stage requirements are satisfied and no blocking questions remain."
    else:
        reason = "; ".join(blocking_reasons)

    return StageValidationResult(
        stage=stage,
        missing_fields=missing_fields,
        blocking_reasons=blocking_reasons,
        stage_is_clear_enough=stage_is_clear_enough,
        transition_decision_reason=reason,
    )
