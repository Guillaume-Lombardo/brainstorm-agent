"""Initial schema."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create the initial database schema."""
    op.create_table(
        "sessions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("current_stage", sa.String(length=64), nullable=False),
        sa.Column("state_payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "messages",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "session_id",
            sa.String(length=36),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("modality", sa.String(length=16), nullable=False),
        sa.Column("stage", sa.String(length=64), nullable=False),
        sa.Column("turn_index", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "documents",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "session_id",
            sa.String(length=36),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("stage", sa.String(length=64), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("markdown", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("facts_payload", sa.JSON(), nullable=False),
        sa.Column("assumptions_payload", sa.JSON(), nullable=False),
        sa.Column("decisions_payload", sa.JSON(), nullable=False),
        sa.Column("uncertainties_payload", sa.JSON(), nullable=False),
        sa.Column("open_questions_payload", sa.JSON(), nullable=False),
        sa.Column("risks_payload", sa.JSON(), nullable=False),
        sa.Column("is_current", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "transition_decisions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "session_id",
            sa.String(length=36),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("from_stage", sa.String(length=64), nullable=False),
        sa.Column("to_stage", sa.String(length=64), nullable=True),
        sa.Column("stage_is_clear_enough", sa.Boolean(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("missing_fields_payload", sa.JSON(), nullable=False),
        sa.Column("blocking_reasons_payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "open_questions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "session_id",
            sa.String(length=36),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("stage", sa.String(length=64), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("why_it_matters", sa.Text(), nullable=True),
        sa.Column("blocking", sa.Boolean(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "human_review_decisions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "session_id",
            sa.String(length=36),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("from_stage", sa.String(length=64), nullable=False),
        sa.Column("proposed_next_stage", sa.String(length=64), nullable=True),
        sa.Column("decision", sa.String(length=16), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    """Drop the initial database schema."""
    op.drop_table("human_review_decisions")
    op.drop_table("open_questions")
    op.drop_table("transition_decisions")
    op.drop_table("documents")
    op.drop_table("messages")
    op.drop_table("sessions")
