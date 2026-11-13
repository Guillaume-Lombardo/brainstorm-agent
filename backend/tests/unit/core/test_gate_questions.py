from __future__ import annotations

import pytest

from brainstorm_agent.core.enums import Language, Stage
from brainstorm_agent.core.gate_questions import (
    FIELD_QUESTIONS,
    RULE_QUESTIONS,
    field_question,
    gate_questions,
)
from brainstorm_agent.core.models import OpenQuestionItem
from brainstorm_agent.core.quality_rules import STAGE_RULES
from brainstorm_agent.core.stage_contracts import STAGE_CONTRACTS
from brainstorm_agent.core.validation import validate_stage


def test_every_gated_field_and_rule_has_wording_in_each_language() -> None:
    fields = {name for contract in STAGE_CONTRACTS.values() for name in contract.required_fields}
    fields |= {name for rules in STAGE_RULES.values() for rule in rules for name in rule.required_fields}
    rules = {rule.id for rules in STAGE_RULES.values() for rule in rules} | {"contradictions"}
    assert fields <= FIELD_QUESTIONS.keys()
    assert rules <= RULE_QUESTIONS.keys()
    for wording in [*FIELD_QUESTIONS.values(), *RULE_QUESTIONS.values()]:
        assert set(wording.question) == set(Language)


@pytest.mark.parametrize("language", list(Language))
def test_field_question_offers_options_and_a_recommendation(language: Language) -> None:
    question = field_question("measurable_objectives", language=language)
    assert question.field == "measurable_objectives"
    assert 2 <= len(question.options) <= 4
    assert question.recommended_option in question.options
    assert question.why_it_matters
    assert "measurable_objectives" not in question.question


def test_gate_questions_follow_the_session_language() -> None:
    validation = validate_stage(
        stage=Stage.STAGE_1_PROBLEM_FRAMING,
        extracted_fields={"problem_statement": "Les tournées sont planifiées à la main."},
        open_questions=[],
        partial_fields={"problem_statement": "Périmètre flou"},
        contradictions=["Livraison en 24 h ou en 48 h"],
    )
    questions = gate_questions(
        validation,
        language=Language.FR,
        partial_fields={"problem_statement": "Périmètre flou"},
        contradictions=["Livraison en 24 h ou en 48 h"],
        model_questions=[],
    )
    texts = " ".join(q.question for q in questions)
    assert "Please clarify" not in texts
    assert "Quel problème" in texts
    assert any("Livraison en 24 h ou en 48 h" in q.question for q in questions)
    partial = next(q for q in questions if q.field == "problem_statement")
    assert "Périmètre flou" in (partial.why_it_matters or "")
    assert all(q.id.startswith("gate:") and len(q.id) <= 36 for q in questions)
    assert all(2 <= len(q.options) <= 4 and q.recommended_option in q.options for q in questions)


def test_gate_skips_fields_the_model_already_asks_about() -> None:
    validation = validate_stage(
        stage=Stage.STAGE_1_PROBLEM_FRAMING,
        extracted_fields={},
        open_questions=[],
    )
    asked = OpenQuestionItem(question="Who are the users?", field="users_actors")
    questions = gate_questions(
        validation,
        language=Language.EN,
        partial_fields={},
        contradictions=[],
        model_questions=[asked],
    )
    fields = [q.field for q in questions]
    assert "users_actors" not in fields
    assert "problem_statement" in fields
    assert len(fields) == len(set(fields))


def test_rule_question_is_skipped_when_its_field_is_already_missing() -> None:
    validation = validate_stage(
        stage=Stage.STAGE_0_PITCH,
        extracted_fields={},
        open_questions=[],
    )
    questions = gate_questions(
        validation,
        language=Language.EN,
        partial_fields={},
        contradictions=[],
        model_questions=[],
    )
    assert [q.field for q in questions].count("pitch_summary") == 1
