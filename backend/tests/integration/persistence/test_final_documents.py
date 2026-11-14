"""Final document lifecycle at the persistence boundary."""

from __future__ import annotations

import asyncio
from typing import cast
from unittest.mock import AsyncMock

import pytest
from openai import AsyncOpenAI

from brainstorm_agent.core.enums import DocumentKind, LLMMode, Stage
from brainstorm_agent.core.final_documents import FinalStageDocument
from brainstorm_agent.core.models import AssistantAnalysis, StageState, StepDocument
from brainstorm_agent.core.stage_contracts import BacklogFields
from brainstorm_agent.persistence.session import (
    create_all,
    create_engine_from_settings,
    create_session_factory,
)
from brainstorm_agent.services.llm_client import OpenAICompatibleBrainstormLLM
from brainstorm_agent.services.prompt_loader import PromptLoader
from brainstorm_agent.services.session_service import SessionService
from brainstorm_agent.settings import Settings

PITCH = "pitch: A weekly meal planner that builds the shopping list\nclear: weekly plan\nambiguous: budgets\nmissing: pricing"


@pytest.fixture
def service(tmp_path):
    settings = Settings(llm_mode=LLMMode.FAKE, database_url=f"sqlite:///{tmp_path / 'final.db'}")
    engine = create_engine_from_settings(settings)
    create_all(engine)
    with create_session_factory(engine)() as db:
        yield SessionService(db_session=db, settings=settings)
    engine.dispose()


@pytest.mark.parametrize("human", [False, True])
def test_validation_adds_one_final_version_and_reopen_revalidates(service, human, mocker):
    service.settings.require_human_validation_for_transitions = human
    rewrite = mocker.spy(service.llm, "final_document")
    sid = service.create_session("Meal planner").session_id
    service.process_user_message(session_id=sid, content="pitch: A weekly meal planner for families")
    assert rewrite.call_count == 0
    assert [doc.kind for doc in service.list_documents(sid)] == ["working"]
    output = service.process_user_message(session_id=sid, content=PITCH)
    assert "### Readiness" in output.step_markdown
    if human:
        assert rewrite.call_count == 0
        service.review_pending_transition(session_id=sid, approved=True)
    docs = service.list_documents(sid)
    assert [doc.kind for doc in docs] == ["working", "working", "final"]
    assert rewrite.call_count == 1
    assert docs[-1].version == 3
    assert "weekly meal planner" in docs[-1].markdown
    for noise in ("pitch_summary", "Readiness", "Clarifications", "Transition Decision", "Newly confirmed"):
        assert noise not in docs[-1].markdown
    for section in ("Facts", "Assumptions", "Decisions", "Risks", "Open Questions"):
        assert section in docs[-1].markdown
    exported = service.export_markdown(sid)
    assert exported.startswith("# Meal planner\n")
    assert docs[-1].markdown in exported
    assert sid not in exported
    assert "Message count" not in exported
    service.reopen_stage(sid, Stage.STAGE_0_PITCH)
    assert "weekly meal planner" not in service.export_markdown(sid)
    service.process_user_message(session_id=sid, content=PITCH)
    if human:
        service.review_pending_transition(session_id=sid, approved=True)
    assert rewrite.call_count == 2
    assert [doc.kind for doc in service.list_documents(sid)].count("final") == 2
    assert service.list_documents(sid)[-1].version == 5
    assert len(service.export_json(sid)["documents"]) == 5


@pytest.mark.parametrize("failure", [RuntimeError("private provider content"), {"invalid": True}])
def test_rewrite_failure_does_not_rollback_validation(service, mocker, failure):
    logger = mocker.patch("brainstorm_agent.services.session_service.get_logger").return_value
    rewrite = (
        AsyncMock(side_effect=failure) if isinstance(failure, Exception) else AsyncMock(return_value=failure)
    )
    mocker.patch.object(service.llm, "final_document", rewrite)
    sid = service.create_session().session_id
    service.process_user_message(session_id=sid, content=PITCH)
    assert service.get_session(sid).current_stage == Stage.STAGE_1_PROBLEM_FRAMING
    final = service.list_documents(sid)[-1]
    assert final.kind == "final"
    assert "weekly meal planner" in final.markdown
    assert "pitch_summary" not in final.markdown
    assert rewrite.call_count == 1
    logger.warning.assert_called_once_with(
        "final_document_fallback",
        session_id=sid,
        stage=Stage.STAGE_0_PITCH.value,
        error_type="RuntimeError" if isinstance(failure, Exception) else "ValidationError",
    )


def test_rejected_review_does_not_finalize(service, mocker):
    service.settings.require_human_validation_for_transitions = True
    rewrite = mocker.spy(service.llm, "final_document")
    sid = service.create_session().session_id
    service.process_user_message(session_id=sid, content=PITCH)
    service.review_pending_transition(session_id=sid, approved=False)
    assert rewrite.call_count == 0
    assert all(doc.kind == "working" for doc in service.list_documents(sid))
    assert "weekly meal planner" not in service.export_markdown(sid)


@pytest.mark.parametrize("human", [False, True])
def test_terminal_stage_is_finalized_once_then_can_be_reopened(service, human, mocker):

    service.settings.require_human_validation_for_transitions = human
    rewrite = mocker.spy(service.llm, "final_document")
    sid = service.create_session().session_id
    state = service.sessions.to_state(service.sessions.require(sid))
    state.current_stage = Stage.STAGE_7_DELIVERY_SLICING
    state.stage_states[Stage.STAGE_6_BACKLOG_SYNTHESIS] = StageState(
        stage=Stage.STAGE_6_BACKLOG_SYNTHESIS,
        extracted_fields=BacklogFields.model_validate({
            "mvp_user_stories": [{"id": "story-1", "statement": "Export a report"}],
        }),
    )
    service.sessions.save_state(sid, state)
    service.db_session.commit()
    content = 'slices: [{"id":"slice-0","goal":"Walking skeleton","backlog_item_ids":["story-1"],"integration_scenarios":[{"ears":"WHEN requested THE SYSTEM SHALL export reports"}]}]'
    output = service.process_user_message(session_id=sid, content=content)
    assert output.stage_clear_enough
    assert output.next_stage is None
    if human:
        assert output.pending_review.to_stage is None
        assert rewrite.call_count == 0
        service.review_pending_transition(session_id=sid, approved=True)
    else:
        service.process_user_message(session_id=sid, content=content)
    assert rewrite.call_count == 1
    assert [doc.kind for doc in service.list_documents(sid)].count("final") == 1
    service.reopen_stage(sid, Stage.STAGE_7_DELIVERY_SLICING)
    service.process_user_message(session_id=sid, content=content)
    if human:
        service.review_pending_transition(session_id=sid, approved=True)
    assert rewrite.call_count == 2


def test_export_uses_canonical_order_latest_finals_and_excludes_stale_stages(service):

    sid = service.create_session("Project title").session_id
    state = service.sessions.to_state(service.sessions.require(sid))
    for stage in reversed(Stage.ordered()[:3]):
        state.stage_states[stage.value] = StageState(stage=stage, stage_is_clear_enough=True)
        for version in (1, 2):
            service.documents.create_version(
                StepDocument(
                    session_id=sid,
                    stage=stage,
                    version=version,
                    kind=DocumentKind.FINAL,
                    markdown=f"## Clean {stage.value} v{version}",
                    summary="Clean",
                ),
            )
    state.stage_states[Stage.STAGE_2_USER_STORY_MAPPING].stale = True
    service.sessions.save_state(sid, state)
    service.db_session.commit()
    exported = service.export_markdown(sid)
    assert exported.index("stage_0_pitch") < exported.index("stage_1_problem_framing")
    assert "v1" not in exported
    assert "stage_2_user_story_mapping" not in exported


@pytest.mark.parametrize("human", [False, True])
def test_final_language_survives_disabled_transcript_retention(service, human):
    service.settings.llm_context_turns = 0
    service.settings.require_human_validation_for_transitions = human
    sid = service.create_session("Projet de repas").session_id
    service.process_user_message(
        session_id=sid,
        content=(
            "pitch: Un planificateur de repas pour les familles pressées\n"
            "clear: Une liste de courses\nambiguous: Les tarifs\nmissing: Le budget"
        ),
    )
    if human:
        service.review_pending_transition(session_id=sid, approved=True)
    final = service.list_documents(sid)[-1]
    assert final.kind == "final"
    assert "### Faits" in final.markdown
    assert "### Questions ouvertes" in final.markdown
    assert "### Présentation du projet" in final.markdown
    assert "Document de cadrage" in service.export_markdown(sid)


@pytest.mark.parametrize("human", [False, True])
def test_owned_provider_stays_open_for_rewrite_and_closes_afterward(service, human, mocker):
    adapters = []

    def build(**kwargs: object) -> OpenAICompatibleBrainstormLLM:
        del kwargs
        adapter = OpenAICompatibleBrainstormLLM(
            client=AsyncOpenAI(api_key="offline-test", base_url="https://provider.invalid/v1"),
            settings=service.settings,
            prompt_loader=PromptLoader(),
        )
        analysis = AssistantAnalysis.model_validate({
            "stage": Stage.STAGE_0_PITCH,
            "summary": "Working history",
            "assistant_message": "Ready",
            "extracted_fields": {
                "pitch_summary": "A weekly meal planner for families",
                "clear_points": ["Plans"],
                "ambiguities": ["Pricing"],
                "missing_information": ["Budget"],
            },
        })
        mocker.patch.object(adapter, "analyze", new=AsyncMock(return_value=analysis))
        mocker.patch.object(adapter, "challenge", new=AsyncMock(return_value=analysis))
        mocker.patch.object(adapter, "reply", new=AsyncMock(return_value="Ready"))

        def rewrite(**kwargs: object) -> FinalStageDocument:
            assert not adapter.client.is_closed()
            return FinalStageDocument.model_validate(kwargs["source"])

        mocker.patch.object(adapter, "final_document", new=AsyncMock(side_effect=rewrite))
        adapters.append(adapter)
        return adapter

    service.settings.require_human_validation_for_transitions = human
    mocker.patch("brainstorm_agent.services.session_service.build_llm", side_effect=build)
    sid = service.create_session().session_id
    # Force the normal owned-adapter reconstruction path at the start of a turn.
    adapter = build()
    asyncio.run(adapter.client.close())
    service.llm = adapter
    service.process_user_message(session_id=sid, content=PITCH)
    if human:
        service.review_pending_transition(session_id=sid, approved=True)
    assert all(item.client.is_closed() for item in adapters)
    assert sum(cast("AsyncMock", item.final_document).await_count for item in adapters) == 1
    assert service.list_documents(sid)[-1].kind == "final"


@pytest.mark.parametrize("stage", [Stage.STAGE_0_PITCH, Stage.STAGE_7_DELIVERY_SLICING])
def test_legacy_validated_stages_export_cleanly_without_mutating_history(service, stage, mocker):
    sid = service.create_session().session_id
    state = service.sessions.to_state(service.sessions.require(sid))
    state.current_stage = stage.next_stage() or stage
    state.stage_states[stage.value] = StageState.model_validate({
        "stage": stage,
        "stage_is_clear_enough": True,
        "extracted_fields": {"pitch_summary": "A legacy project for product teams"}
        if stage == Stage.STAGE_0_PITCH
        else {"slices": [{"id": "slice-0", "goal": "A legacy project for product teams"}]},
    })
    service.documents.create_version(
        StepDocument(
            session_id=sid,
            stage=stage,
            version=1,
            markdown="Readiness and working history",
            summary="History",
        ),
    )
    service.sessions.save_state(sid, state)
    service.db_session.commit()
    rewrite = mocker.spy(service.llm, "final_document")
    markdown = service.export_markdown(sid)
    assert "A legacy project for product teams" in markdown
    assert "Readiness" not in markdown
    assert "working history" not in markdown
    assert len(service.list_documents(sid)) == 1
    assert rewrite.call_count == 0
