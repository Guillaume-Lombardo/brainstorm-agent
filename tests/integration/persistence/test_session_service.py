from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from brainstorm_agent.core.enums import LLMMode, Stage
from brainstorm_agent.exceptions import ConflictError
from brainstorm_agent.persistence.session import (
    create_all,
    create_engine_from_settings,
    create_session_factory,
)
from brainstorm_agent.services.session_service import SessionService
from brainstorm_agent.settings import Settings

if TYPE_CHECKING:
    from pathlib import Path


def _build_settings(tmp_path: Path) -> Settings:
    return Settings(
        database_url=f"sqlite+pysqlite:///{tmp_path / 'service.db'}",
        llm_mode=LLMMode.HEURISTIC,
        redis_url="redis://localhost:6399/0",
    )


def test_session_service_persists_versions_and_resolves_open_questions(tmp_path: Path) -> None:
    settings = _build_settings(tmp_path)
    engine = create_engine_from_settings(settings)
    create_all(engine)
    session_factory = create_session_factory(engine)

    with session_factory() as db_session:
        service = SessionService(db_session=db_session, settings=settings)
        session = service.create_session()

        first_output = service.process_user_message(
            session_id=session.session_id,
            content="A tool to structure project brainstorming for product teams.",
        )
        assert first_output.current_stage is Stage.STAGE_1_PROBLEM_FRAMING

        blocked_output = service.process_user_message(
            session_id=session.session_id,
            content="problem: Discovery is inconsistent across teams.",
        )
        assert blocked_output.current_stage is Stage.STAGE_1_PROBLEM_FRAMING
        assert blocked_output.stage_clear_enough is False
        assert blocked_output.open_questions

        clear_output = service.process_user_message(
            session_id=session.session_id,
            content=(
                "problem: Discovery is inconsistent across teams.\n"
                "users: Product managers; founders\n"
                "objectives: reduce ambiguity; speed up scoping\n"
                "constraints: must stay model-agnostic; keep Markdown artifacts\n"
                "non_goals: building a general assistant\n"
                "hypotheses: teams want structured guidance\n"
                "initial_risks: low adoption; incomplete inputs\n"
                "5w1h: who product teams; what project framing; why reduce ambiguity; how staged workflow"
            ),
        )
        assert clear_output.current_stage is Stage.STAGE_2_USER_STORY_MAPPING
        assert clear_output.next_stage is Stage.STAGE_2_USER_STORY_MAPPING

        documents = service.list_documents(session.session_id)
        stage_1_documents = [item for item in documents if item.stage is Stage.STAGE_1_PROBLEM_FRAMING]
        assert len(stage_1_documents) == 2
        assert stage_1_documents[-1].version == 2
        assert service.get_session(session.session_id).open_questions == []


def test_session_service_requires_human_review_when_enabled(tmp_path: Path) -> None:
    settings = _build_settings(tmp_path)
    settings.require_human_validation_for_transitions = True
    engine = create_engine_from_settings(settings)
    create_all(engine)
    session_factory = create_session_factory(engine)

    with session_factory() as db_session:
        service = SessionService(db_session=db_session, settings=settings)
        session = service.create_session()

        first_output = service.process_user_message(
            session_id=session.session_id,
            content="A tool to structure project brainstorming for product teams.",
        )
        assert first_output.requires_human_review is True
        assert first_output.current_stage is Stage.STAGE_0_PITCH
        assert first_output.pending_review is not None

        approved = service.review_pending_transition(
            session_id=session.session_id,
            approved=True,
            note="Approved for progression.",
        )
        assert approved.current_stage is Stage.STAGE_1_PROBLEM_FRAMING
        assert approved.pending_human_review is None
        assert service.list_human_reviews(session.session_id)[0].decision.value == "approved"


def test_session_service_reject_review_keeps_stage_and_clears_pending_review(tmp_path: Path) -> None:
    settings = _build_settings(tmp_path)
    settings.require_human_validation_for_transitions = True
    engine = create_engine_from_settings(settings)
    create_all(engine)
    session_factory = create_session_factory(engine)

    with session_factory() as db_session:
        service = SessionService(db_session=db_session, settings=settings)
        session = service.create_session()

        first_output = service.process_user_message(
            session_id=session.session_id,
            content="A tool to structure project brainstorming for product teams.",
        )
        assert first_output.pending_review is not None

        rejected = service.review_pending_transition(
            session_id=session.session_id,
            approved=False,
            note="More review is needed before transition.",
        )
        assert rejected.current_stage is Stage.STAGE_0_PITCH
        assert rejected.pending_human_review is None
        assert service.list_human_reviews(session.session_id)[0].decision.value == "rejected"


def test_session_service_blocks_new_message_while_review_is_pending(tmp_path: Path) -> None:
    settings = _build_settings(tmp_path)
    settings.require_human_validation_for_transitions = True
    engine = create_engine_from_settings(settings)
    create_all(engine)
    session_factory = create_session_factory(engine)

    with session_factory() as db_session:
        service = SessionService(db_session=db_session, settings=settings)
        session = service.create_session()

        service.process_user_message(
            session_id=session.session_id,
            content="A tool to structure project brainstorming for product teams.",
        )

        with pytest.raises(ConflictError) as exc_info:
            service.process_user_message(
                session_id=session.session_id,
                content="Trying to continue before human review.",
            )
        assert "human review is pending" in str(exc_info.value)
