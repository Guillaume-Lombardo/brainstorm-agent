"""Strict golden scenario and observation contracts."""

from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from pathlib import Path

import yaml
from pydantic import BaseModel, ConfigDict, Field

from brainstorm_agent.core.enums import Stage  # noqa: TC001 - Pydantic schema


class AnswerMode(StrEnum):
    """Source of user answers in a live evaluation."""

    SCRIPTED = "scripted"
    SIMULATED = "simulated"


class GoldenTurn(BaseModel):
    """An oracle checkpoint, independent of the recorded provider response."""

    model_config = ConfigDict(extra="forbid")
    stage: Stage
    answer: str = Field(min_length=1)
    should_advance: bool
    contradiction: str | None = None
    recorded_analysis: dict[str, Any]


class Scenario(BaseModel):
    """Persona and private knowledge, never passed to the evaluated adapter."""

    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^[a-z0-9-]+$")
    persona: str = Field(min_length=1)
    hidden_facts: list[str] = Field(min_length=1)
    answer_mode: AnswerMode = AnswerMode.SCRIPTED
    turns: list[GoldenTurn] = Field(min_length=1)
    must_complete: bool = False


class QualityScore(BaseModel):
    """Rubric scores: 0 fails, 1 weak, 2 adequate, 3 strong, 4 excellent."""

    model_config = ConfigDict(extra="forbid")
    specificity: int = Field(ge=0, le=4)
    traceability: int = Field(ge=0, le=4)
    no_invented_facts: int = Field(ge=0, le=4)
    rationale: str


class Observation(BaseModel):
    """One attempted turn, including failed provider responses."""

    stage: Stage
    expected: bool
    actual: bool = False
    latency_seconds: float = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    schema_failure: bool = False
    error: str | None = None
    contradiction_found: bool | None = None
    markdown: str = ""
    quality: QualityScore | None = None


def load_scenarios(directory: Path) -> list[Scenario]:
    """Load sorted YAML scenarios with strict validation.

    Args:
        directory (Path): Directory containing golden YAML files.

    Returns:
        list[Scenario]: Validated scenarios with unique identifiers.

    Raises:
        ValueError: No files or duplicate identifiers were found.
    """
    scenarios = [
        Scenario.model_validate(yaml.safe_load(path.read_text())) for path in sorted(directory.glob("*.yaml"))
    ]
    if not scenarios or len({item.id for item in scenarios}) != len(scenarios):
        message = "Scenarios must be nonempty and have unique ids."
        raise ValueError(message)
    return scenarios
