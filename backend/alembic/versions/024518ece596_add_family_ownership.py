
"""add family ownership

Revision ID: 024518ece596
Revises: 57fbff3261d3
Create Date: 2026-11-21 19:29:33.834923
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "024518ece596"
down_revision: Union[str, Sequence[str], None] = "57fbff3261d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# def upgrade() -> None:
#     op.add_column(
#         "families",
#         sa.Column("created_by", sa.Uuid(), nullable=True),
#     )
#     op.create_foreign_key(
#         "fk_families_created_by_users",
#         "families",
#         "users",
#         ["created_by"],
#         ["id"],
#     )
def upgrade() -> None:
    with op.batch_alter_table('families') as batch_op:
        batch_op.create_foreign_key(
            "fk_families_created_by_users",
            "users", # or whatever table it points to
            ["created_by"],
            ["id"]
        )


def downgrade() -> None:
    op.drop_constraint(
        "fk_families_created_by_users",
        "families",
        type_="foreignkey",
    )
    op.drop_column("families", "created_by")
