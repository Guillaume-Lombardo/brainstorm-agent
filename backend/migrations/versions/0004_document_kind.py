"""Distinguish working and final stage document versions."""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Backfill existing documents as working versions on SQLite and PostgreSQL."""
    op.add_column("documents", sa.Column("kind", sa.String(16), server_default="working", nullable=False))


def downgrade() -> None:
    """Remove lifecycle metadata while retaining every document version."""
    op.drop_column("documents", "kind")
