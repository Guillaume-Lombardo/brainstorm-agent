"""Clean deliverables share a state-only schema with the provider boundary."""

from __future__ import annotations

from brainstorm_agent.core.enums import Language, OpenQuestionStatus, Stage
from brainstorm_agent.core.models import AssumptionItem, DecisionItem, FactItem, OpenQuestionItem, StageState
from brainstorm_agent.core.research import escape_markdown
from brainstorm_agent.core.stage_contracts import DeliveryFields, PitchFields
from brainstorm_agent.services.final_documents import from_stage_state, render_final


def test_fallback_is_complete_localized_and_drops_working_metadata():
    state = StageState(
        stage=Stage.STAGE_0_PITCH,
        summary="Newly confirmed at turn 12: secret working history",
        transition_decision_reason="Move to another stage",
        extracted_fields=PitchFields.model_validate({
            "pitch_summary": "Un outil pour les équipes produit",
            "clear_points": ["Documents partagés"],
            "ambiguities": ["Tarification"],
            "missing_information": ["Budget"],
        }),
        facts=[FactItem(statement="Les équipes sont distribuées")],
        assumptions=[AssumptionItem(statement="Usage hebdomadaire")],
        decisions=[DecisionItem(statement="Commencer par le cadrage", rationale="Réduire les risques")],
        open_questions=[
            OpenQuestionItem(question="Budget disponible ?"),
            OpenQuestionItem(question="Question résolue", status=OpenQuestionStatus.RESOLVED),
        ],
    )
    content = from_stage_state(state, Language.FR)
    markdown = render_final(content, stage=state.stage, language=Language.FR)
    for expected in (
        "Présentation du projet",
        "Documents partagés",
        "Tarification",
        "Budget",
        "Faits",
        "Hypothèses",
        "Décisions",
        "Risques",
        "Questions ouvertes",
        "Les équipes sont distribuées",
        "Usage hebdomadaire",
        "Budget disponible",
    ):
        assert escape_markdown(expected) in markdown
    for noise in ("turn 12", "working history", "pitch_summary", "Question résolue", "Move to another"):
        assert noise not in markdown
    assert "Aucun élément consigné." in markdown


def test_nested_delivery_content_preserves_references_without_raw_keys():
    state = StageState(
        stage=Stage.STAGE_7_DELIVERY_SLICING,
        extracted_fields=DeliveryFields.model_validate({
            "slices": [
                {
                    "id": "slice-0",
                    "goal": "Report export",
                    "backlog_item_ids": ["story-1"],
                    "provided_contracts": [{"id": "reports", "specification": "GET /reports"}],
                    "integration_scenarios": [{"ears": "WHEN requested THE SYSTEM SHALL export reports"}],
                },
            ],
        }),
    )
    markdown = render_final(from_stage_state(state, Language.EN), stage=state.stage, language=Language.EN)
    for expected in ("slice-0", "story-1", "GET /reports", "WHEN requested THE SYSTEM SHALL export reports"):
        assert escape_markdown(expected) in markdown
    assert "backlog_item_ids" not in markdown
    assert "provided_contracts" not in markdown
