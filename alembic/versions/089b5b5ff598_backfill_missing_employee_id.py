"""backfill missing employee_id

Revision ID: 089b5b5ff598
Revises: e3931199c09d
Create Date: 2026-08-10 12:40:50.812641

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '089b5b5ff598'
down_revision: Union[str, Sequence[str], None] = 'e3931199c09d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    """Upgrade schema."""
    op.execute(
        """
        UPDATE users
        SET employee_id = (CASE WHEN role = 'manager' THEN 'MGR-' ELSE 'EMP-' END)
            || lpad(id::text, 4, '0')
        WHERE employee_id IS NULL
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    pass
