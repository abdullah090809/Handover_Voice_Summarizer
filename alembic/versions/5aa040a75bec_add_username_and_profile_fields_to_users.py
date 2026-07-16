"""add username and profile fields to users

Revision ID: 5aa040a75bec
Revises: ab952f5ec814
Create Date: 2026-07-16 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "5aa040a75bec"
down_revision = "ab952f5ec814"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- pending_users table ---
    op.add_column("pending_users", sa.Column("username", sa.String(), nullable=True))
    op.add_column("pending_users", sa.Column("name", sa.String(), nullable=True))
    op.add_column("pending_users", sa.Column("phone_number", sa.String(), nullable=True))
    op.add_column("pending_users", sa.Column("job_title", sa.String(), nullable=True))

    op.execute("UPDATE pending_users SET username = 'pending_' || id WHERE username IS NULL")

    op.alter_column("pending_users", "username", nullable=False)
    op.create_unique_constraint("uq_pending_users_username", "pending_users", ["username"])

    # --- users table ---
    op.add_column("users", sa.Column("username", sa.String(), nullable=True))
    op.add_column("users", sa.Column("phone_number", sa.String(), nullable=True))
    op.add_column("users", sa.Column("job_title", sa.String(), nullable=True))
    op.add_column("users", sa.Column("bio", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("profile_photo_url", sa.String(), nullable=True))

    op.execute("UPDATE users SET username = 'user_' || id WHERE username IS NULL")

    op.alter_column("users", "username", nullable=False)
    op.create_unique_constraint("uq_users_username", "users", ["username"])


def downgrade() -> None:
    op.drop_constraint("uq_users_username", "users", type_="unique")
    op.drop_column("users", "profile_photo_url")
    op.drop_column("users", "bio")
    op.drop_column("users", "job_title")
    op.drop_column("users", "phone_number")
    op.drop_column("users", "username")

    op.drop_constraint("uq_pending_users_username", "pending_users", type_="unique")
    op.drop_column("pending_users", "job_title")
    op.drop_column("pending_users", "phone_number")
    op.drop_column("pending_users", "name")
    op.drop_column("pending_users", "username")