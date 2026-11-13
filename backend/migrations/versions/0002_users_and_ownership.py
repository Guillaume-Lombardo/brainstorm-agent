"""Add users and assign existing sessions to a bootstrap owner."""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create identities and backfill ownership before making it mandatory."""
    users = op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False, unique=True),
        sa.Column("display_name", sa.String(200), nullable=False),
        sa.Column("password_hash", sa.Text()),
        sa.Column("oidc_issuer", sa.String(500)),
        sa.Column("oidc_subject", sa.String(255)),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("oidc_issuer", "oidc_subject"),
    )
    op.bulk_insert(
        users,
        [
            {
                "id": "00000000-0000-0000-0000-000000000001",
                "email": "bootstrap@localhost.invalid",
                "display_name": "Bootstrap",
                "active": True,
            },
        ],
    )
    with op.batch_alter_table("sessions") as batch:
        batch.add_column(sa.Column("owner_id", sa.String(36), nullable=True))
    op.execute("UPDATE sessions SET owner_id = '00000000-0000-0000-0000-000000000001'")
    with op.batch_alter_table("sessions") as batch:
        batch.alter_column("owner_id", existing_type=sa.String(36), nullable=False)
        batch.create_foreign_key("fk_sessions_owner_id", "users", ["owner_id"], ["id"])
        batch.create_index("ix_sessions_owner_id", ["owner_id"])


def downgrade() -> None:
    """Remove ownership and identities, preserving session content."""
    with op.batch_alter_table("sessions") as batch:
        batch.drop_index("ix_sessions_owner_id")
        batch.drop_constraint("fk_sessions_owner_id", type_="foreignkey")
        batch.drop_column("owner_id")
    op.drop_table("users")
