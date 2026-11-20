"""pairings for /switchboard

Revision ID: 3f6c2a9d1b07
Revises: 8e1bd88c8a54
Create Date: 2026-11-20 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "3f6c2a9d1b07"
down_revision: str | None = "8e1bd88c8a54"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "pairings",
        sa.Column("code", sa.String(length=6), nullable=False),
        sa.Column("offerer_token", sa.String(length=64), nullable=False),
        sa.Column("answerer_token", sa.String(length=64), nullable=True),
        sa.Column("offer", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=True),
        sa.Column("candidates", sa.JSON(), nullable=False),
        sa.Column("relayed_bytes", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("joined_at", sa.DateTime(), nullable=True),
        sa.Column("opened_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("code"),
    )


def downgrade() -> None:
    op.drop_table("pairings")
