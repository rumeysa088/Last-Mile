from fastapi import Depends, HTTPException, status

from app.core.dependencies import get_current_user
from app.models.models import User


def get_current_tenant(
    current_user: User = Depends(get_current_user),
):
    if current_user.tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not associated with a tenant",
        )

    return current_user.tenant_id