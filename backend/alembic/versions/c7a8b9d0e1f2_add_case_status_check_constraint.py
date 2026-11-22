"""Add case status check constraint.

Revision ID: c7a8b9d0e1f2
Revises: b325c9c389ff
Create Date: 2026-11-22 13:40:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c7a8b9d0e1f2"
down_revision: Union[str, Sequence[str], None] = "b325c9c389ff"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add check constraint to ensure only valid case statuses can be saved."""
    op.create_check_constraint(
        "ck_cases_valid_status",
        "cases",
        "status IN ('submitted', 'under_review', 'approved', 'rejected', 'needs_information', 'closed')",
    )


def downgrade() -> None:
    """Drop case status check constraint."""
    op.drop_constraint("ck_cases_valid_status", "cases", type_="check")
