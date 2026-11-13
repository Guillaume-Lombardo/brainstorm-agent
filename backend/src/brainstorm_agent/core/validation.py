"""Rule-based validation for stage transitions."""

from __future__ import annotations

from typing import Any

from brainstorm_agent.core.enums import OpenQuestionStatus, Stage
from brainstorm_agent.core.models import (
    CoverageStatus,
    OpenQuestionItem,
    ReadinessItem,
    StageValidationResult,
)
from brainstorm_agent.core.quality_rules import STAGE_RULES, concrete
from brainstorm_agent.core.stage_contracts import STAGE_CONTRACTS, STAGE_MODELS


def validate_stage(  # noqa: PLR0913 - independent gate inputs at the domain boundary
    *,
    stage: Stage,
    extracted_fields: dict[str, Any],
    open_questions: list[OpenQuestionItem],
    partial_fields: dict[str, str] | None = None,
    previous_fields: dict[str, Any] | None = None,
    contradictions: list[str] | None = None,
) -> StageValidationResult:
    """Evaluate field coverage and declarative readiness without trusting provider approval.

    Args:
        stage (Stage): Active stage.
        extracted_fields (dict[str, Any]): Accumulated fields.
        open_questions (list[OpenQuestionItem]): All retained questions.
        partial_fields (dict[str, str] | None): Proposed partial coverage with reasons.
        previous_fields (dict[str, Any] | None): Earlier stage field snapshots.
        contradictions (list[str] | None): Unresolved contradictory findings.

    Returns:
        StageValidationResult: Authoritative readiness checklist and decision.
    """
    partial = partial_fields or {}
    coverage = {
        name: CoverageStatus.MISSING
        if not concrete(extracted_fields.get(name))
        else (CoverageStatus.PARTIAL if partial.get(name, "").strip() else CoverageStatus.CLEAR)
        for name in STAGE_MODELS[stage].model_fields
    }
    required = (
        *STAGE_CONTRACTS[stage].required_fields,
        *(
            name
            for rule in STAGE_RULES.get(stage, ())
            if rule.applies(extracted_fields)
            for name in rule.required_fields
        ),
    )
    checklist = [
        ReadinessItem(
            id=f"field:{name}",
            passed=coverage[name] is CoverageStatus.CLEAR,
            message=f"Required field {name}: {coverage[name].value}"
            + (f" ({partial[name]})" if coverage[name] is CoverageStatus.PARTIAL else ""),
        )
        for name in required
    ]
    checklist.extend(
        ReadinessItem(
            id=rule.id,
            passed=rule.condition(extracted_fields, previous_fields or {}),
            message=rule.message,
        )
        for rule in STAGE_RULES.get(stage, ())
    )
    checklist.extend([
        ReadinessItem(
            id="blocking_questions",
            passed=not any(q.blocking and q.status is OpenQuestionStatus.OPEN for q in open_questions),
            message="Blocking questions remain open.",
        ),
        ReadinessItem(
            id="contradictions",
            passed=not contradictions,
            message="Unresolved contradictions: " + "; ".join(contradictions or []),
        ),
    ])
    reasons = [item.message for item in checklist if not item.passed]
    return StageValidationResult(
        stage=stage,
        coverage=coverage,
        readiness=checklist,
        missing_fields=[name for name in required if coverage[name] is CoverageStatus.MISSING],
        blocking_reasons=reasons,
        stage_is_clear_enough=not reasons,
        transition_decision_reason="; ".join(reasons)
        if reasons
        else "All coded stage requirements are satisfied and no blocking questions remain.",
    )
