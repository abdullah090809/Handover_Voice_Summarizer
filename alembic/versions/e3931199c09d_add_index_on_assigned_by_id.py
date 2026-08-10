"""add index on resident_assignments.assigned_by_id

Stage 6 performance review: resident_id, care_worker_id, and manager_id
were already indexed when the assignment system landed, but
assigned_by_id (used to filter/join "assignments made by manager X")
was left unindexed. Traffic on that column is low today, but it's a FK
used in lookups/joins, so it should be indexed like its siblings.

Revision ID: e3931199c09d
Revises: 63519c84123e
Create Date: 2026-08-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e3931199c09d'
down_revision: Union[str, Sequence[str], None] = '63519c84123e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_index(
        op.f('ix_resident_assignments_assigned_by_id'),
        'resident_assignments',
        ['assigned_by_id'],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        op.f('ix_resident_assignments_assigned_by_id'),
        table_name='resident_assignments',
    )
