from __future__ import annotations

from typing import TYPE_CHECKING

from brainstorm_agent.core.enums import LLMMode, MessageRole, Modality, Stage
from brainstorm_agent.core.models import (
    BrainstormSessionState,
    ConversationTurn,
    OpenQuestionItem,
    StepDocument,
)
from brainstorm_agent.persistence.repositories import (
    DocumentRepository,
    MessageRepository,
    OpenQuestionRepository,
    SessionRepository,
    TransitionRepository,
)
from brainstorm_agent.persistence.session import (
    create_all,
    create_engine_from_settings,
    create_session_factory,
    session_scope,
)
from brainstorm_agent.settings import Settings

if TYPE_CHECKING:
    from pathlib import Path


def _build_settings(tmp_path: Path) -> Settings:
    return Settings(
        database_url=f"sqlite+pysqlite:///{tmp_path / 'unit-repositories.db'}",
        llm_mode=LLMMode.HEURISTIC,
        redis_url="redis://localhost:6399/0",
    )


def test_repositories_cover_state_history_documents_and_open_questions(tmp_path: Path) -> None:
    settings = _build_settings(tmp_path)
    engine = create_engine_from_settings(settings)
    create_all(engine)
    session_factory = create_session_factory(engine)

    with session_factory() as db_session:
        sessions = SessionRepository(db_session)
        messages = MessageRepository(db_session)
        documents = DocumentRepository(db_session)
        open_questions = OpenQuestionRepository(db_session)
        transitions = TransitionRepository(db_session)

        state = BrainstormSessionState(session_id="session-1")
        sessions.create(state)
        sessions.save_state("session-1", state)
        assert sessions.to_state(sessions.require("session-1")).session_id == "session-1"

        messages.add(
            ConversationTurn(
                session_id="session-1",
                role=MessageRole.USER,
                content="pitch",
                modality=Modality.TEXT,
                stage=Stage.STAGE_0_PITCH,
            ),
        )
        assert len(messages.list_for_session("session-1")) == 1

        documents.create_version(
            StepDocument(
                session_id="session-1",
                stage=Stage.STAGE_0_PITCH,
                version=1,
                markdown="# Doc",
                summary="summary",
            ),
        )
        assert documents.get_current("session-1") is not None
        assert len(documents.list_all("session-1")) == 1

        open_questions.sync_stage_questions(
            session_id="session-1",
            stage=Stage.STAGE_0_PITCH,
            questions=[OpenQuestionItem(question="Who is the user?", blocking=True)],
        )
        assert len(open_questions.list_open("session-1")) == 1
        open_questions.sync_stage_questions(
            session_id="session-1",
            stage=Stage.STAGE_0_PITCH,
            questions=[],
        )
        assert open_questions.list_open("session-1") == []

        transitions.add(
            session_id="session-1",
            from_stage=Stage.STAGE_0_PITCH,
            to_stage=Stage.STAGE_1_PROBLEM_FRAMING,
            validation={
                "stage_is_clear_enough": True,
                "transition_decision_reason": "complete",
                "missing_fields": [],
                "blocking_reasons": [],
            },
        )
        db_session.commit()


def test_session_scope_commits_and_closes(tmp_path: Path) -> None:
    settings = _build_settings(tmp_path)
    engine = create_engine_from_settings(settings)
    create_all(engine)
    session_factory = create_session_factory(engine)

    with session_scope(session_factory) as db_session:
        SessionRepository(db_session).create(BrainstormSessionState(session_id="session-2"))

    with session_factory() as verify_session:
        assert SessionRepository(verify_session).get("session-2") is not None
