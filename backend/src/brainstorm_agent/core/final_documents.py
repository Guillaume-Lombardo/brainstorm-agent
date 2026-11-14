"""Typed content contract for a clean, validated stage deliverable."""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

type DocumentText = Annotated[str, Field(min_length=1)]


class FinalSection(BaseModel):
    """One human-readable subject and its complete business content."""

    model_config = ConfigDict(extra="forbid", strict=True)
    title: str = Field(min_length=1)
    items: list[DocumentText] = Field(min_length=1)


class FinalStageDocument(BaseModel):
    """Provider output shared by rewriting and deterministic fallback rendering."""

    model_config = ConfigDict(extra="forbid", strict=True)
    sections: list[FinalSection] = Field(min_length=1)
    facts: list[DocumentText]
    assumptions: list[DocumentText]
    decisions: list[DocumentText]
    risks: list[DocumentText]
    open_questions: list[DocumentText]
