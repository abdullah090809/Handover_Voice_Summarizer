"""add_check_constraints_and_indices

Revision ID: 8feba5108178
Revises: 5aa040a75bec
Create Date: 2026-08-03 12:30:45.673290

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8feba5108178'
down_revision: Union[str, Sequence[str], None] = '5aa040a75bec'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add check constraints
    op.create_check_constraint(
        "ck_users_role",
        "users",
        "role IN ('care_worker', 'manager', 'deactivated')"
    )
    op.create_check_constraint(
        "ck_handover_notes_status",
        "handover_notes",
        "status IN ('pending', 'processing', 'complete', 'failed')"
    )
    # Add index on created_at for handover_notes
    op.create_index(
        op.f("ix_handover_notes_created_at"),
        "handover_notes",
        ["created_at"],
        unique=False
    )


def downgrade() -> None:
    # Drop index
    op.drop_index(op.f("ix_handover_notes_created_at"), table_name="handover_notes")
    # Drop check constraints
    op.drop_constraint("ck_handover_notes_status", "handover_notes", type_="check")
    op.drop_constraint("ck_users_role", "users", type_="check")
