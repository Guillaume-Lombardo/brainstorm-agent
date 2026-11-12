"""LangGraph state definitions."""

from __future__ import annotations

from typing import Any, NotRequired, TypedDict


class TurnGraphState(TypedDict):
    """Graph state for one processed assistant turn."""

    session_id: str
    session_state: dict[str, Any]
    current_stage: str
    user_message: str
    analysis: NotRequired[dict[str, Any]]
    validation: NotRequired[dict[str, Any]]
    markdown: NotRequired[str]
    assistant_output: NotRequired[dict[str, Any]]
