"""Pydantic models for user management and authentication."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class User(BaseModel):
    """Public user representation (no password hash)."""
    id: UUID
    email: str
    display_name: str
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


class UserCreate(BaseModel):
    """Data required to register a new user."""
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=8, max_length=200)


class UserLogin(BaseModel):
    """Data required to log in."""
    email: EmailStr
    password: str


class UserWithToken(BaseModel):
    """User data returned after successful register/login."""
    user: User
    token: str
