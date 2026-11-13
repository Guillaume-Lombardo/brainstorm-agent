"""User administration and credential verification independent of HTTP."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import uuid4

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from sqlalchemy import select

from brainstorm_agent.persistence.models import BOOTSTRAP_USER_ID, UserRecord

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

MAX_PASSWORD_LENGTH = 1024
PASSWORD_HASHER = PasswordHasher()
DUMMY_HASH = PASSWORD_HASHER.hash("invalid-login-placeholder")


def hash_password(password: str) -> str:
    """Hash a password with Argon2id.

    Args:
        password: str: Password obtained through a secure input channel.

    Returns:
        str: Salted Argon2id hash.

    Raises:
        ValueError: Password is empty or too long.
    """
    if not password or len(password) > MAX_PASSWORD_LENGTH:
        message = "Password must contain between 1 and 1024 characters."
        raise ValueError(message)
    return PASSWORD_HASHER.hash(password)


class UserService:
    """Manage persisted identities without committing caller transactions."""

    def __init__(self, db: Session) -> None:
        """Initialize user storage.

        Args:
            db: Session: Caller-owned transaction.
        """
        self.db = db

    def ensure_bootstrap(self) -> UserRecord:
        """Create the development owner if absent.

        Returns:
            UserRecord: Bootstrap owner without credentials.
        """
        user = self.db.get(UserRecord, BOOTSTRAP_USER_ID)
        if user is None:
            user = UserRecord(
                id=BOOTSTRAP_USER_ID,
                email="bootstrap@localhost.invalid",
                display_name="Bootstrap",
            )
            self.db.add(user)
            self.db.flush()
        return user

    def get_active(self, user_id: str) -> UserRecord | None:
        """Look up an active identity.

        Args:
            user_id: str: Identity identifier.

        Returns:
            UserRecord | None: Active row, if present.
        """
        user = self.db.get(UserRecord, user_id)
        return user if user is not None and user.active else None

    def create(self, email: str, display_name: str, password: str) -> UserRecord:
        """Create a local identity.

        Args:
            email: str: Unique email, normalized to lowercase.
            display_name: str: Human-readable name.
            password: str: New password.

        Returns:
            UserRecord: Created identity.
        """
        user = UserRecord(
            id=str(uuid4()),
            email=email.strip().lower(),
            display_name=display_name,
            password_hash=hash_password(password),
        )
        self.db.add(user)
        self.db.flush()
        return user

    def verify(self, email: str, password: str) -> UserRecord | None:
        """Verify credentials with uniform unknown-user hashing cost.

        Args:
            email: str: Login email.
            password: str: Candidate password.

        Returns:
            UserRecord | None: Active identity on success.
        """
        user = self.db.scalar(select(UserRecord).where(UserRecord.email == email.strip().lower()))
        encoded = user.password_hash if user and user.password_hash else DUMMY_HASH
        try:
            PASSWORD_HASHER.verify(encoded, password)
        except VerificationError:
            return None
        if not user or not user.active or not user.password_hash:
            return None
        if PASSWORD_HASHER.check_needs_rehash(encoded):
            user.password_hash = hash_password(password)
        return user

    def provision_oidc(self, issuer: str, subject: str, email: str, display_name: str) -> UserRecord:
        """Resolve a verified OIDC identity; never link by email alone.

        Args:
            issuer: str: Trusted configured issuer.
            subject: str: Provider subject verified by the frontend server.
            email: str: Verified email.
            display_name: str: Provider display name.

        Returns:
            UserRecord: Existing or provisioned identity.

        Raises:
            ValueError: Identity is disabled or email belongs to another account.
        """
        user = self.db.scalar(
            select(UserRecord).where(UserRecord.oidc_issuer == issuer, UserRecord.oidc_subject == subject),
        )
        if user is not None:
            if not user.active:
                message = "Identity unavailable."
                raise ValueError(message)
            return user
        email = email.strip().lower()
        if self.db.scalar(select(UserRecord).where(UserRecord.email == email)) is not None:
            message = "Identity unavailable."
            raise ValueError(message)
        user = UserRecord(
            id=str(uuid4()),
            email=email,
            display_name=display_name,
            oidc_issuer=issuer,
            oidc_subject=subject,
        )
        self.db.add(user)
        self.db.flush()
        return user
