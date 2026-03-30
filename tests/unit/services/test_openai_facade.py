from __future__ import annotations

from dataclasses import dataclass

from brainstorm_agent.core.enums import Stage
from brainstorm_agent.core.models import AssistantTurnOutput
from brainstorm_agent.services.openai_facade import OpenAIChatFacade


@dataclass
class _FakeSessionOverview:
    session_id: str


class _FakeSessionService:
    def __init__(self) -> None:
        self.created_session_ids: list[str] = []
        self.processed_messages: list[tuple[str, str]] = []

    def create_session(self) -> _FakeSessionOverview:
        session_id = f"session-{len(self.created_session_ids) + 1}"
        self.created_session_ids.append(session_id)
        return _FakeSessionOverview(session_id)

    def process_user_message(self, *, session_id: str, content: str) -> AssistantTurnOutput:
        self.processed_messages.append((session_id, content))
        return AssistantTurnOutput(
            session_id=session_id,
            current_stage=Stage.STAGE_1_PROBLEM_FRAMING,
            processed_stage=Stage.STAGE_0_PITCH,
            stage_clear_enough=True,
            assistant_message="Stage accepted.",
            summary="Pitch clarified.",
            step_markdown="# Structured Summary\n\nPitch clarified.",
            transition_decision_reason="Ready for the next stage.",
            next_stage=Stage.STAGE_1_PROBLEM_FRAMING,
        )


def test_openai_facade_creates_session_when_missing_metadata() -> None:
    session_service = _FakeSessionService()
    facade = OpenAIChatFacade(
        session_service=session_service,
        public_model_name="brainstorm-agent",
    )

    result = facade.process_chat_completion(
        model="brainstorm-agent",
        messages=[("system", "Ignore this"), ("user", "Clarify my project pitch")],
        metadata={},
    )

    assert result.session_id == "session-1"
    assert session_service.processed_messages == [("session-1", "Clarify my project pitch")]
    assert "# Structured Summary" in result.content


def test_openai_facade_reuses_metadata_session_id() -> None:
    session_service = _FakeSessionService()
    facade = OpenAIChatFacade(
        session_service=session_service,
        public_model_name="brainstorm-agent",
    )

    result = facade.process_chat_completion(
        model="brainstorm-agent",
        messages=[("user", "Continue this brainstorm")],
        metadata={"session_id": "existing-session"},
    )

    assert result.session_id == "existing-session"
    assert session_service.created_session_ids == []
    assert session_service.processed_messages == [("existing-session", "Continue this brainstorm")]
