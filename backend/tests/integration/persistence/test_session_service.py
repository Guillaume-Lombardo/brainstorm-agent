from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

import pytest
from pydantic import ValidationError

from brainstorm_agent.core.enums import LLMMode, Stage
from brainstorm_agent.core.models import AssistantAnalysis, OpenQuestionItem, QuestionPriority
from brainstorm_agent.exceptions import ConflictError, LLMResponseError
from brainstorm_agent.persistence.session import (
    create_all,
    create_engine_from_settings,
    create_session_factory,
)
from brainstorm_agent.services.llm_client import FakeBrainstormLLM
from brainstorm_agent.services.prompt_loader import PromptLoader
from brainstorm_agent.services.session_service import SessionService
from brainstorm_agent.settings import Settings

if TYPE_CHECKING:
    from pathlib import Path

    from pytest_mock import MockerFixture


def _build_settings(tmp_path: Path) -> Settings:
    return Settings(
        database_url=f"sqlite+pysqlite:///{tmp_path / 'service.db'}",
        llm_mode=LLMMode.FAKE,
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
            content="pitch: A tool to structure project brainstorming for product teams.\nclear: Staged framing\nambiguities: Audience to confirm\nmissing: Adoption target",
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
                "objectives: reduce ambiguity by 20 percent; scope in 2 days\n"
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
        assert len(stage_1_documents) == 3
        assert stage_1_documents[-1].version == 3
        assert stage_1_documents[-1].kind == "final"
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
            content="pitch: A tool to structure project brainstorming for product teams.\nclear: Staged framing\nambiguities: Audience to confirm\nmissing: Adoption target",
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
            content="pitch: A tool to structure project brainstorming for product teams.\nclear: Staged framing\nambiguities: Audience to confirm\nmissing: Adoption target",
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
            content="pitch: A tool to structure project brainstorming for product teams.\nclear: Staged framing\nambiguities: Audience to confirm\nmissing: Adoption target",
        )

        with pytest.raises(ConflictError) as exc_info:
            service.process_user_message(
                session_id=session.session_id,
                content="Trying to continue before human review.",
            )
        assert "human review is pending" in str(exc_info.value)


def test_failed_analysis_does_not_persist_partial_turn(tmp_path: Path, mocker) -> None:
    settings = _build_settings(tmp_path)
    engine = create_engine_from_settings(settings)
    create_all(engine)
    with create_session_factory(engine)() as db:
        service = SessionService(db_session=db, settings=settings)
        session_id = service.create_session().session_id
        mocker.patch.object(
            service.llm,
            "analyze",
            side_effect=LLMResponseError(stage=Stage.STAGE_0_PITCH.value),
        )
        with pytest.raises(LLMResponseError):
            service.process_user_message(session_id=session_id, content="A free form answer")
        db.commit()
        assert len(service.list_messages(session_id)) == 1
        assert service.list_documents(session_id) == []
        assert service.get_session(session_id).current_stage is Stage.STAGE_0_PITCH


def test_turn_usage_survives_session_reload(tmp_path: Path) -> None:
    settings = _build_settings(tmp_path)
    engine = create_engine_from_settings(settings)
    create_all(engine)
    factory = create_session_factory(engine)
    fake = FakeBrainstormLLM(
        prompt_loader=PromptLoader(),
        scripted_responses=[
            AssistantAnalysis(
                summary="Partial",
                assistant_message="Who?",
                prompt_tokens=21,
                completion_tokens=8,
            ),
        ],
    )
    with factory() as db:
        service = SessionService(db_session=db, settings=settings, llm=fake)
        session_id = service.create_session().session_id
        output = service.process_user_message(session_id=session_id, content="Here is my idea")
        assert output.prompt_tokens == 21
    with factory() as db:
        turns = SessionService(db_session=db, settings=settings).list_messages(session_id)
        assert turns[-1].prompt_tokens == 21
        assert turns[-1].completion_tokens == 8


def test_reworded_question_keeps_id_in_persistence(tmp_path: Path) -> None:
    settings = _build_settings(tmp_path)
    engine = create_engine_from_settings(settings)
    create_all(engine)
    fake = FakeBrainstormLLM(
        prompt_loader=PromptLoader(),
        scripted_responses=[
            AssistantAnalysis(
                summary="Partial",
                assistant_message="Who?",
                open_questions=[OpenQuestionItem(id="q1", question="Who?")],
            ),
            AssistantAnalysis(
                summary="Partial",
                assistant_message="Which teams?",
                open_questions=[OpenQuestionItem(id="q1", question="Which teams?")],
            ),
        ],
    )
    with create_session_factory(engine)() as db:
        service = SessionService(db_session=db, settings=settings, llm=fake)
        session_id = service.create_session().session_id
        first = service.process_user_message(session_id=session_id, content="A project")
        question_id = first.open_questions[0].id
        fake.scripted_responses[0].open_questions[0].id = question_id
        service.process_user_message(session_id=session_id, content="Please clarify your question")
        questions = service.get_session(session_id).open_questions
        question = next(q for q in questions if q.id == question_id)
        assert question.question == "Which teams?"


def test_provider_question_ids_cannot_collide_between_sessions(tmp_path: Path) -> None:
    settings = _build_settings(tmp_path)
    engine = create_engine_from_settings(settings)
    create_all(engine)
    fake = FakeBrainstormLLM(
        prompt_loader=PromptLoader(),
        scripted_responses=[
            AssistantAnalysis(
                summary="Partial",
                assistant_message="Who?",
                open_questions=[OpenQuestionItem(id="q1", question="Who?")],
            )
            for _ in range(2)
        ],
    )
    with create_session_factory(engine)() as db:
        service = SessionService(db_session=db, settings=settings, llm=fake)
        ids = []
        for _ in range(2):
            session_id = service.create_session().session_id
            output = service.process_user_message(session_id=session_id, content="A project")
            ids.append(output.open_questions[0].id)
            assert service.get_session(session_id).open_questions[0].id == ids[-1]
        assert ids[0] != ids[1]
        assert all(len(item) == 36 for item in ids)


def test_budget_keeps_all_questions_and_metadata_in_overview(tmp_path: Path) -> None:
    settings = _build_settings(tmp_path)
    engine = create_engine_from_settings(settings)
    create_all(engine)
    fake = FakeBrainstormLLM(
        prompt_loader=PromptLoader(),
        scripted_responses=[
            AssistantAnalysis(
                summary="Questions",
                assistant_message="Please clarify",
                open_questions=[
                    OpenQuestionItem(
                        id=f"q{i}",
                        question=f"Security question {i}?",
                        priority=QuestionPriority.SECURITY,
                        options=["Restrict", "Allow"],
                        recommended_option="Restrict",
                        why_it_matters="Protect user data",
                    )
                    for i in range(5)
                ],
            ),
        ],
    )
    with create_session_factory(engine)() as db:
        service = SessionService(db_session=db, settings=settings, llm=fake)
        session_id = service.create_session().session_id
        output = service.process_user_message(session_id=session_id, content="A project")
        assert len(output.open_questions) == 3
        assert not output.stage_clear_enough
        sql_questions = service.open_questions.list_open(session_id)
        assert len(sql_questions) > 3
    with create_session_factory(engine)() as db:
        service = SessionService(db_session=db, settings=settings, llm=fake)
        questions = service.get_session(session_id).open_questions
        provider_questions = [q for q in questions if q.question.startswith("Security question")]
        assert len(provider_questions) == 5
        assert all(
            q.priority == "security/compliance"
            and q.options == ["Restrict", "Allow"]
            and q.recommended_option == "Restrict"
            and q.why_it_matters == "Protect user data"
            for q in provider_questions
        )


def _llm_failure(cause: Exception) -> LLMResponseError:
    error = LLMResponseError(stage="stage_0_pitch", message="Invalid structured output.")
    error.__cause__ = cause
    return error


def _validation_error(value: str) -> ValidationError:
    try:
        AssistantAnalysis.model_validate({"stage": value})
    except ValidationError as exc:
        return exc
    raise AssertionError


@pytest.mark.parametrize(
    ("cause", "expected"),
    [
        (ValueError("Response truncated or refused"), "Response truncated or refused"),
        (_validation_error("SECRET-USER-CONTENT"), "ValidationError"),
    ],
)
def test_stream_turn_logs_the_failure_it_hides_from_the_client(
    tmp_path: Path,
    mocker: MockerFixture,
    caplog: pytest.LogCaptureFixture,
    cause: Exception,
    expected: str,
) -> None:
    settings = _build_settings(tmp_path)
    engine = create_engine_from_settings(settings)
    create_all(engine)
    mocker.patch.object(FakeBrainstormLLM, "analyze", side_effect=_llm_failure(cause))
    # Alembic's `fileConfig` disables loggers created before a migration test ran.
    mocker.patch.object(logging.getLogger(SessionService.__module__), "disabled", new=False)
    caplog.set_level(logging.ERROR)

    async def consume(service: SessionService, session_id: str) -> list[str]:
        return [event.type async for event in service.stream_turn(session_id, "hello")]

    with create_session_factory(engine)() as db_session:
        service = SessionService(db_session=db_session, settings=settings)
        session_id = service.create_session().session_id
        events = asyncio.run(consume(service, session_id))

    assert events == ["turn.started", "analysis.status", "error"]
    failure = next(record for record in caplog.records if "turn_failed" in record.getMessage())
    assert session_id in failure.getMessage()
    assert "LLMResponseError" in failure.getMessage()
    assert expected in failure.getMessage()
    # Model output may quote the user: it never reaches the logs.
    assert "SECRET-USER-CONTENT" not in caplog.text
