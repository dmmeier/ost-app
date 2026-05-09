"""Authentication endpoints: register, login, me, status."""

from fastapi import APIRouter, Depends, HTTPException

from ost_core.exceptions import AuthenticationError, DuplicateEmailError, UserNotFoundError
from ost_core.models import User, UserCreate, UserLogin, UserWithToken
from ost_core.services.tree_service import TreeService
from ost_api.deps import get_current_user_required, get_service

router = APIRouter()


@router.post("/register", response_model=UserWithToken, status_code=201)
def register(data: UserCreate, service: TreeService = Depends(get_service)):
    """Register a new user account."""
    try:
        user, token = service.register(data)
        return UserWithToken(user=user, token=token)
    except DuplicateEmailError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except AuthenticationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login", response_model=UserWithToken)
def login(data: UserLogin, service: TreeService = Depends(get_service)):
    """Authenticate and receive a JWT token."""
    try:
        user, token = service.login(data.email, data.password)
        return UserWithToken(user=user, token=token)
    except AuthenticationError as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.get("/me", response_model=User)
def me(user: User = Depends(get_current_user_required)):
    """Get the current authenticated user."""
    return user


@router.get("/status")
def auth_status(service: TreeService = Depends(get_service)):
    """Check if authentication is required (always open, used by frontend).

    If no users exist in the DB, auth is not required (open mode).
    """
    count = service.user_count()
    return {"auth_required": count > 0, "user_count": count}
