"""Authentication utilities: password hashing and JWT token management."""

from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from ost_core.config import get_settings

_ALGORITHM = "HS256"


def hash_password(plain: str) -> str:
    """Hash a plaintext password using bcrypt."""
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def _get_secret(secret: str | None = None) -> str:
    """Return the JWT secret, falling back to settings."""
    if secret:
        return secret
    s = get_settings().jwt_secret
    if not s:
        raise ValueError("OST_JWT_SECRET is not configured")
    return s


def create_token(
    user_id: str,
    secret: str | None = None,
    expiry_days: int | None = None,
) -> str:
    """Create a JWT access token for a user."""
    sec = _get_secret(secret)
    days = expiry_days if expiry_days is not None else get_settings().jwt_expiry_days
    payload = {
        "sub": user_id,
        "exp": datetime.now(UTC) + timedelta(days=days),
        "iat": datetime.now(UTC),
    }
    return jwt.encode(payload, sec, algorithm=_ALGORITHM)


def decode_token(token: str, secret: str | None = None) -> dict:
    """Decode and validate a JWT token. Returns the payload dict.

    Raises jwt.ExpiredSignatureError or jwt.InvalidTokenError on failure.
    """
    sec = _get_secret(secret)
    return jwt.decode(token, sec, algorithms=[_ALGORITHM])
