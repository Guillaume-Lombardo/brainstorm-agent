from __future__ import annotations

from brainstorm_agent.core.enums import Stage
from brainstorm_agent.core.models import OpenQuestionItem
from brainstorm_agent.core.validation import validate_stage


def test_problem_framing_requires_all_contract_fields() -> None:
    result = validate_stage(
        stage=Stage.STAGE_1_PROBLEM_FRAMING,
        extracted_fields={"problem_statement": "Lead qualification is too manual."},
        open_questions=[],
    )

    assert result.stage_is_clear_enough is False
    assert "users_actors" in result.missing_fields
    assert "constraints" in result.missing_fields


def test_stage_with_blocking_open_questions_stays_blocked() -> None:
    result = validate_stage(
        stage=Stage.STAGE_0_PITCH,
        extracted_fields={
            "pitch_summary": "A product idea.",
            "clear_points": ["The product exists."],
            "ambiguities": ["Target users unclear."],
            "missing_information": ["Business objective unclear."],
        },
        open_questions=[OpenQuestionItem(question="Who is the target user?", blocking=True)],
    )

    assert result.stage_is_clear_enough is False
    assert "Blocking questions remain open." in result.blocking_reasons
