
"""Add family consent, audit and rule models.

Revision ID: b325c9c389ff
Revises: 024518ece596
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b325c9c389ff"
down_revision: Union[str, Sequence[str], None] = "024518ece596"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Rule sets
    op.create_table(
        "rule_sets",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # Family members
    op.create_table(
        "family_members",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("full_name", sa.String(150), nullable=False),
        sa.Column("relationship", sa.String(80), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        "ix_family_members_family_id",
        "family_members",
        ["family_id"],
        unique=False,
    )

    # Versioned rules
    op.create_table(
        "rule_versions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("rule_set_id", sa.Uuid(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("rules", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'published', 'archived')",
            name="ck_rule_versions_valid_status",
        ),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["rule_set_id"], ["rule_sets.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "rule_set_id",
            "version",
            name="uq_rule_versions_set_version",
        ),
    )

    # Rule evaluation history
    op.create_table(
        "rule_evaluations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("rule_version_id", sa.Uuid(), nullable=False),
        sa.Column("case_id", sa.Uuid(), nullable=True),
        sa.Column("evaluated_by", sa.Uuid(), nullable=True),
        sa.Column("input_snapshot", sa.JSON(), nullable=False),
        sa.Column("result", sa.JSON(), nullable=False),
        sa.Column("missing_fields", sa.JSON(), nullable=False),
        sa.Column("outcome", sa.String(30), nullable=False),
        sa.Column(
            "evaluated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["case_id"], ["cases.id"]),
        sa.ForeignKeyConstraint(["evaluated_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["rule_version_id"], ["rule_versions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # Audit log extensions
    op.add_column(
        "audit_logs",
        sa.Column("tenant_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "audit_logs",
        sa.Column("actor_role", sa.String(30), nullable=True),
    )
    op.add_column(
        "audit_logs",
        sa.Column("request_id", sa.String(100), nullable=True),
    )

    # Safely extend existing audit records.
    # Add nullable, backfill existing rows, then enforce NOT NULL.
    op.add_column(
        "audit_logs",
        sa.Column("outcome", sa.String(30), nullable=True),
    )

    op.execute(
        "UPDATE audit_logs SET outcome = 'success' WHERE outcome IS NULL"
    )

    op.alter_column(
        "audit_logs",
        "outcome",
        existing_type=sa.String(30),
        nullable=False,
    )

    op.add_column(
        "audit_logs",
        sa.Column("change_summary", sa.JSON(), nullable=True),
    )

    op.create_foreign_key(
        "fk_audit_logs_tenant_id_tenants",
        "audit_logs",
        "tenants",
        ["tenant_id"],
        ["id"],
    )

    # Consent extensions
    op.add_column(
        "consents",
        sa.Column("subject_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "consents",
        sa.Column("recipient_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "consents",
        sa.Column("purpose", sa.String(100), nullable=True),
    )

    op.create_foreign_key(
        "fk_consents_subject_id_family_members",
        "consents",
        "family_members",
        ["subject_id"],
        ["id"],
    )

    op.create_foreign_key(
        "fk_consents_recipient_id_users",
        "consents",
        "users",
        ["recipient_id"],
        ["id"],
    )


def downgrade() -> None:
    # Remove consent extensions
    op.drop_constraint(
        "fk_consents_recipient_id_users",
        "consents",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_consents_subject_id_family_members",
        "consents",
        type_="foreignkey",
    )
    op.drop_column("consents", "purpose")
    op.drop_column("consents", "recipient_id")
    op.drop_column("consents", "subject_id")

    # Remove audit extensions
    op.drop_constraint(
        "fk_audit_logs_tenant_id_tenants",
        "audit_logs",
        type_="foreignkey",
    )
    op.drop_column("audit_logs", "change_summary")
    op.drop_column("audit_logs", "outcome")
    op.drop_column("audit_logs", "request_id")
    op.drop_column("audit_logs", "actor_role")
    op.drop_column("audit_logs", "tenant_id")

    # Remove new tables in dependency order
    op.drop_table("rule_evaluations")
    op.drop_table("rule_versions")

    op.drop_index(
        "ix_family_members_family_id",
        table_name="family_members",
    )
    op.drop_table("family_members")
    op.drop_table("rule_sets")
