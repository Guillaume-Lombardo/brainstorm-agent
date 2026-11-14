"""Clean deliverables share a state-only schema with the provider boundary."""

from __future__ import annotations

from brainstorm_agent.core.enums import Language, OpenQuestionStatus, Stage
from brainstorm_agent.core.final_documents import FinalSection
from brainstorm_agent.core.models import AssumptionItem, DecisionItem, FactItem, OpenQuestionItem, StageState
from brainstorm_agent.core.stage_contracts import DeliveryFields, PitchFields
from brainstorm_agent.services.final_documents import escape_final_markdown, from_stage_state, render_final


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
        "Un outil pour les équipes produit",
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
        assert escape_final_markdown(expected) in markdown
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
        assert escape_final_markdown(expected) in markdown
    assert "backlog_item_ids" not in markdown
    assert "provided_contracts" not in markdown


def _library_pitch() -> StageState:
    return StageState.model_validate({
        "stage": Stage.STAGE_0_PITCH,
        "extracted_fields": {
            "pitch_summary": "A mobile-first tool library for neighbors. Members lend tools peer-to-peer.",
            "clear_points": [
                "Members lend tools peer-to-peer.",
                "Reservations last 48 hours.",
                "Main risk identified: Tools may be returned damaged.",
            ],
            "ambiguities": ["Who pays for repairs?"],
            "missing_information": ["  who pays for repairs ? ", "Launch budget"],
        },
        "facts": [
            {"statement": "A mobile-first tool library for neighbors."},
            {"statement": "Reservations last 48 hours"},
            {"statement": "Main risk identified: Tools may be returned damaged."},
        ],
        "risks": [
            {
                "category": "operational",
                "description": "Tools may be returned damaged.",
                "impact": "Replacement costs",
                "probability": "Medium",
                "mitigation": "Inspect returns",
                "action": "Agree a repair policy",
            },
        ],
        "open_questions": [{"question": "Who pays for repairs?"}],
        "uncertainties": ["Launch budget.", "Blocking questions remain unresolved."],
    })


def test_pitch_fallback_has_one_overview_and_no_repeated_governance():
    content = from_stage_state(_library_pitch(), Language.EN)
    assert content.overview == ("A mobile-first tool library for neighbors. Members lend tools peer-to-peer.")
    assert content.sections == []
    assert content.facts == ["Reservations last 48 hours."]
    assert content.open_questions == ["Who pays for repairs?", "Launch budget."]
    assert len(content.risks) == 1
    assert "Tools may be returned damaged." in content.risks[0]
    assert "Inspect returns" in content.risks[0]


def test_pitch_markdown_states_every_statement_once():
    state = _library_pitch()
    markdown = render_final(from_stage_state(state, Language.EN), stage=state.stage, language=Language.EN)
    for statement in (
        "A mobile-first tool library for neighbors.",
        "Members lend tools peer-to-peer.",
        "Reservations last 48 hours.",
        "Tools may be returned damaged.",
        "Who pays for repairs?",
        "Launch budget.",
    ):
        assert markdown.count(statement) == 1
    assert "### Clear points" not in markdown
    assert "### Ambiguities" not in markdown
    assert "### Missing information" not in markdown
    assert markdown.split("\n\n")[1] == from_stage_state(state, Language.EN).overview


def test_problem_fields_fold_into_governance_but_keep_five_w_one_h():
    state = StageState.model_validate({
        "stage": Stage.STAGE_1_PROBLEM_FRAMING,
        "extracted_fields": {
            "problem_statement": "Neighbors cannot find tools nearby.",
            "users_actors": ["Local residents"],
            "constraints": ["Mobile-first"],
            "measurable_objectives": ["100 loans per month"],
            "non_goals": ["No tool sales"],
            "hypotheses": ["Residents will lend tools"],
            "initial_risks": ["Tools get lost"],
            "five_w_one_h": "Residents borrow nearby tools at weekends.",
        },
        "facts": [{"statement": "mobile-first."}, {"statement": "Tools get lost"}],
        "assumptions": [{"statement": "Residents will lend tools."}],
        "decisions": [{"statement": "No tool sales", "rationale": "Focus on lending"}],
    })
    content = from_stage_state(state, Language.EN)
    assert [section.title for section in content.sections] == ["Five w one h"]
    assert content.facts == ["Local residents", "100 loans per month", "Mobile-first"]
    assert content.assumptions == ["Residents will lend tools."]
    assert content.decisions == ["No tool sales (Focus on lending)"]
    assert content.risks == ["Tools get lost"]


def test_final_markdown_preserves_punctuation_and_neutralizes_untrusted_syntax():
    assert escape_final_markdown("mobile-first, D+1, (a, b)! #tag") == "mobile-first, D+1, (a, b)! #tag"
    for marker in ("# heading", "- list", "+ list", "1. list", "42. list"):
        assert "\\" in escape_final_markdown(marker)
    assert escape_final_markdown("line\n\n# heading\n1. list").count("\n") == 0
    for char in "\\`*_[]<>|~":
        assert escape_final_markdown(char) == "\\" + char
    text = escape_final_markdown(
        "![image](https://bad.test) [link](https://bad.test) <img src=x> `code` *bold*",
    )
    assert "\\[image\\]" in text
    assert "\\[link\\]" in text
    assert "\\<img" in text
    assert "\\`code\\`" in text
    assert "\\*bold\\*" in text
    # GFM also auto-links bare URLs and emails, even inside escaped link syntax.
    assert "https://" not in text
    assert "www.bad.test" not in escape_final_markdown("www.bad.test")
    assert "@&#8203;" in escape_final_markdown("team@example.test")
    assert "&#" not in escape_final_markdown("&#60;script&#62;")


def test_long_overview_keeps_overflow_and_distinct_business_values():
    state = StageState(
        stage=Stage.STAGE_0_PITCH,
        extracted_fields=PitchFields(
            pitch_summary="Sentence one. Sentence two. Sentence three. Sentence four. Sentence five.",
            clear_points=["D+1", "D+2", "Mobile\u2011first", "mobile-first.", "100 loans", "1000 loans"],
        ),
    )
    content = from_stage_state(state, Language.EN)
    assert content.overview.count("Sentence") == 4
    assert content.facts == ["Sentence five.", "D+1", "D+2", "Mobile\u2011first", "100 loans", "1000 loans"]
    markdown = render_final(content, stage=state.stage, language=Language.EN)
    assert markdown.count("Sentence five.") == 1


def test_renderer_removes_duplicate_items_in_rewritten_content():
    content = from_stage_state(_library_pitch(), Language.EN)
    content.sections = [FinalSection(title="Capabilities", items=["Book tools", "Book tools."])]
    content.facts.extend([content.overview, "Book tools", "reservations last 48 hours"])
    markdown = render_final(content, stage=Stage.STAGE_0_PITCH, language=Language.EN)
    assert markdown.count("Book tools") == 1
    assert markdown.count("A mobile-first tool library") == 1
    assert markdown.count("Reservations last 48 hours") == 1


def test_risk_fields_keep_each_complete_record_and_suppress_duplicate_state_rows():
    risk = {
        "id": "risk-1",
        "category": "operational",
        "description": "Tools get lost",
        "impact": "High",
        "probability": "Medium",
        "mitigation": "Track returns",
        "action": "Agree a lending policy",
    }
    state = StageState.model_validate({
        "stage": Stage.STAGE_5_RISK_STORMING,
        "extracted_fields": {"risks_by_category": [risk]},
        "risks": [risk],
        "facts": [{"statement": "Tools get lost"}],
    })
    content = from_stage_state(state, Language.EN)
    assert content.sections == []
    assert len(content.risks) == 1
    for expected in ("risk-1", "Tools get lost", "High", "Track returns", "Agree a lending policy"):
        assert expected in content.risks[0]
    assert content.facts == []
