"""initial schema

Issue #20 fix: this is the first checked-in migration for a project that
previously had none. It reflects the *fixed* model state from this review —
RESTRICT (not CASCADE) on shift_id/care_home_id FKs (Issue #9), indexes on
every foreign key (Issue #10), and the status/error_message columns added
to handover_notes to support background processing (Issue #14).

If a production database already exists from `Base.metadata.create_all()`,
run `alembic stamp 0001` instead of `alembic upgrade head` to mark this
revision as already applied without re-running the DDL, then generate a
follow-up migration for just the deltas (RESTRICT, indexes, new columns).

Revision ID: 0001
Revises:
Create Date: 2026-07-11

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "care_homes",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("address", sa.String(), nullable=True),
    )

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("email", sa.String(), nullable=False, unique=True),
        sa.Column("password", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False, server_default="care_worker"),
        sa.Column(
            "care_home_id",
            sa.Integer(),
            sa.ForeignKey("care_homes.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_users_care_home_id", "users", ["care_home_id"])

    op.create_table(
        "residents",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column(
            "care_home_id",
            sa.Integer(),
            # Issue #9 fix: RESTRICT, not CASCADE.
            sa.ForeignKey("care_homes.id", ondelete="RESTRICT"),
            nullable=False,
        ),
    )
    op.create_index("ix_residents_care_home_id", "residents", ["care_home_id"])

    op.create_table(
        "shifts",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column(
            "worker_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("start_time", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("end_time", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.create_index("ix_shifts_worker_id", "shifts", ["worker_id"])

    op.create_table(
        "handover_notes",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column(
            "shift_id",
            sa.Integer(),
            # Issue #9 fix: RESTRICT, not CASCADE.
            sa.ForeignKey("shifts.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "resident_id",
            sa.Integer(),
            sa.ForeignKey("residents.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("raw_transcript", sa.String(), nullable=True),
        sa.Column("summary_json", postgresql.JSONB(), nullable=True),
        sa.Column("urgency_flag", sa.String(), nullable=True),
        # Issue #14 fix: processing status columns.
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("error_message", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_handover_notes_shift_id", "handover_notes", ["shift_id"])
    op.create_index("ix_handover_notes_resident_id", "handover_notes", ["resident_id"])
    op.create_index("ix_handover_notes_urgency_flag", "handover_notes", ["urgency_flag"])

    op.create_table(
        "password_resets",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("email", sa.String(), nullable=False, unique=True),
        sa.Column("otp_code", sa.String(), nullable=False),
        sa.Column("otp_expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("otp_request_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "otp_window_start",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    op.create_table(
        "pending_users",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("email", sa.String(), nullable=False, unique=True),
        sa.Column("password", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False, server_default="care_worker"),
        sa.Column(
            "care_home_id",
            sa.Integer(),
            sa.ForeignKey("care_homes.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("otp_code", sa.String(), nullable=False),
        sa.Column("otp_expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("otp_request_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "otp_window_start",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )


def downgrade() -> None:
    op.drop_table("pending_users")
    op.drop_table("password_resets")
    op.drop_index("ix_handover_notes_urgency_flag", table_name="handover_notes")
    op.drop_index("ix_handover_notes_resident_id", table_name="handover_notes")
    op.drop_index("ix_handover_notes_shift_id", table_name="handover_notes")
    op.drop_table("handover_notes")
    op.drop_index("ix_shifts_worker_id", table_name="shifts")
    op.drop_table("shifts")
    op.drop_index("ix_residents_care_home_id", table_name="residents")
    op.drop_table("residents")
    op.drop_index("ix_users_care_home_id", table_name="users")
    op.drop_table("users")
    op.drop_table("care_homes")
