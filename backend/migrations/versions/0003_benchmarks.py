"""Add versioned benchmark executions."""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create benchmark history with UUID-width identifiers."""
    op.create_table(
        "benchmarks",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "session_id",
            sa.String(36),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.UniqueConstraint("session_id", "version"),
    )
    op.create_index("ix_benchmarks_session_id", "benchmarks", ["session_id"])


def downgrade() -> None:
    """Remove benchmark history."""
    op.drop_table("benchmarks")
