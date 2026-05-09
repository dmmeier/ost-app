"""Tests for authentication: password hashing, JWT tokens, register/login."""

import os
import time

import pytest

from ost_core.auth import create_token, decode_token, hash_password, verify_password
from ost_core.exceptions import AuthenticationError, DuplicateEmailError, UserNotFoundError
from ost_core.models import UserCreate


# Set a test JWT secret before any tests run
os.environ.setdefault("OST_JWT_SECRET", "test-secret-key-for-testing")


class TestPasswordHashing:
    def test_hash_and_verify(self):
        hashed = hash_password("mypassword123")
        assert hashed != "mypassword123"
        assert verify_password("mypassword123", hashed)

    def test_wrong_password_fails(self):
        hashed = hash_password("correct-password")
        assert not verify_password("wrong-password", hashed)

    def test_different_hashes_for_same_password(self):
        h1 = hash_password("same-password")
        h2 = hash_password("same-password")
        assert h1 != h2  # bcrypt uses random salts


class TestJWTTokens:
    def test_create_and_decode_token(self):
        token = create_token("user-123", secret="test-secret")
        payload = decode_token(token, secret="test-secret")
        assert payload["sub"] == "user-123"
        assert "exp" in payload
        assert "iat" in payload

    def test_expired_token_raises(self):
        import jwt as pyjwt
        token = create_token("user-123", secret="test-secret", expiry_days=-1)
        with pytest.raises(pyjwt.ExpiredSignatureError):
            decode_token(token, secret="test-secret")

    def test_invalid_token_raises(self):
        import jwt as pyjwt
        with pytest.raises(pyjwt.InvalidTokenError):
            decode_token("not.a.valid.token", secret="test-secret")

    def test_wrong_secret_raises(self):
        import jwt as pyjwt
        token = create_token("user-123", secret="secret-a")
        with pytest.raises(pyjwt.InvalidSignatureError):
            decode_token(token, secret="secret-b")


class TestUserRegistration:
    def test_register_success(self, service):
        user, token = service.register(
            UserCreate(email="test@example.com", display_name="Test User", password="password123")
        )
        assert user.email == "test@example.com"
        assert user.display_name == "Test User"
        assert user.is_active is True
        assert len(token) > 0

    def test_register_duplicate_email(self, service):
        service.register(
            UserCreate(email="dupe@example.com", display_name="First", password="password123")
        )
        with pytest.raises(DuplicateEmailError):
            service.register(
                UserCreate(email="dupe@example.com", display_name="Second", password="password456")
            )

    def test_register_creates_valid_token(self, service):
        user, token = service.register(
            UserCreate(email="token@example.com", display_name="Token User", password="password123")
        )
        payload = decode_token(token)
        assert payload["sub"] == str(user.id)


class TestUserLogin:
    def test_login_success(self, service):
        service.register(
            UserCreate(email="login@example.com", display_name="Login User", password="password123")
        )
        user, token = service.login("login@example.com", "password123")
        assert user.email == "login@example.com"
        assert len(token) > 0

    def test_login_wrong_password(self, service):
        service.register(
            UserCreate(email="wrong@example.com", display_name="Wrong", password="password123")
        )
        with pytest.raises(AuthenticationError):
            service.login("wrong@example.com", "wrongpassword")

    def test_login_nonexistent_email(self, service):
        with pytest.raises(AuthenticationError):
            service.login("nobody@example.com", "password123")


class TestUserCount:
    def test_user_count_starts_at_zero(self, service):
        assert service.user_count() == 0

    def test_user_count_increments(self, service):
        service.register(
            UserCreate(email="count1@example.com", display_name="User 1", password="password123")
        )
        assert service.user_count() == 1
        service.register(
            UserCreate(email="count2@example.com", display_name="User 2", password="password123")
        )
        assert service.user_count() == 2


class TestGetUser:
    def test_get_user_by_id(self, service):
        user, _ = service.register(
            UserCreate(email="getme@example.com", display_name="Get Me", password="password123")
        )
        found = service.get_user(str(user.id))
        assert found.email == "getme@example.com"
        assert found.display_name == "Get Me"

    def test_get_user_not_found(self, service):
        with pytest.raises(UserNotFoundError):
            service.get_user("nonexistent-user-id")
