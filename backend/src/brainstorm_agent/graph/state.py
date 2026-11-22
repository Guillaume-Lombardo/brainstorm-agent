"""LangGraph state definitions."""

from __future__ import annotations

from typing import Any, NotRequired, TypedDict


class TurnGraphState(TypedDict):
    """Graph state for one processed assistant turn."""

    on_delta: NotRequired[Any]
    session_id: str
    session_state: dict[str, Any]
    current_stage: str
    user_message: str
    # What the user typed, when `user_message` also carries server context (candidates, comments).
    user_text: NotRequired[str]
    # The assistant opens the stage: there is no user message.
    opening: NotRequired[bool]
    analysis: NotRequired[dict[str, Any]]
    validation: NotRequired[dict[str, Any]]
    markdown: NotRequired[str]
    assistant_output: NotRequired[dict[str, Any]]
