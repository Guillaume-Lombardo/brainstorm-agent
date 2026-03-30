"""ORM models for brainstorming persistence."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from brainstorm_agent.core.enums import OpenQuestionStatus
from brainstorm_agent.persistence.base import Base


def utc_now() -> datetime:
    """Return the current UTC timestamp.

    Returns:
        datetime: Current aware UTC datetime.
    """
    return datetime.now(tz=UTC)


class SessionRecord(Base):
    """Persistent session row."""

    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    current_stage: Mapped[str] = mapped_column(String(64), nullable=False)
    state_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    messages: Mapped[list[MessageRecord]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
    )
    documents: Mapped[list[DocumentRecord]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
    )
    transitions: Mapped[list[TransitionDecisionRecord]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
    )
    open_questions: Mapped[list[OpenQuestionRecord]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
    )


class MessageRecord(Base):
    """Persistent conversation message."""

    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    modality: Mapped[str] = mapped_column(String(16), nullable=False)
    stage: Mapped[str] = mapped_column(String(64), nullable=False)
    turn_index: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    session: Mapped[SessionRecord] = relationship(back_populates="messages")


class DocumentRecord(Base):
    """Versioned stage document."""

    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    stage: Mapped[str] = mapped_column(String(64), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    markdown: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    facts_payload: Mapped[list] = mapped_column(JSON, default=list)
    assumptions_payload: Mapped[list] = mapped_column(JSON, default=list)
    decisions_payload: Mapped[list] = mapped_column(JSON, default=list)
    uncertainties_payload: Mapped[list] = mapped_column(JSON, default=list)
    open_questions_payload: Mapped[list] = mapped_column(JSON, default=list)
    risks_payload: Mapped[list] = mapped_column(JSON, default=list)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    session: Mapped[SessionRecord] = relationship(back_populates="documents")


class TransitionDecisionRecord(Base):
    """Persistent transition assessment."""

    __tablename__ = "transition_decisions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    from_stage: Mapped[str] = mapped_column(String(64), nullable=False)
    to_stage: Mapped[str | None] = mapped_column(String(64), nullable=True)
    stage_is_clear_enough: Mapped[bool] = mapped_column(Boolean, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    missing_fields_payload: Mapped[list] = mapped_column(JSON, default=list)
    blocking_reasons_payload: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    session: Mapped[SessionRecord] = relationship(back_populates="transitions")


class OpenQuestionRecord(Base):
    """Persistent normalized open question."""

    __tablename__ = "open_questions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    stage: Mapped[str] = mapped_column(String(64), nullable=False)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    why_it_matters: Mapped[str | None] = mapped_column(Text, nullable=True)
    blocking: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=OpenQuestionStatus.OPEN.value)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    session: Mapped[SessionRecord] = relationship(back_populates="open_questions")
