"""Package exceptions."""

from __future__ import annotations

from dataclasses import dataclass


class PackageError(Exception):
    """Root exception for the package."""


@dataclass
class NotFoundError(PackageError):
    """Raised when a requested resource does not exist."""

    message: str

    @classmethod
    def missing_session(cls, session_id: str) -> NotFoundError:
        """Build a missing-session error.

        Args:
            session_id: Session identifier.

        Returns:
            NotFoundError: Session-specific not found error.
        """
        return cls(message=f"Session '{session_id}' was not found.")

    @classmethod
    def missing_document(cls, session_id: str) -> NotFoundError:
        """Build a missing-document error.

        Args:
            session_id: Session identifier.

        Returns:
            NotFoundError: Session document not found error.
        """
        return cls(message=f"Session '{session_id}' has no document yet.")

    def __str__(self) -> str:
        """Return error message payload."""
        return self.message


@dataclass
class SettingsError(PackageError):
    """Raised when settings cannot be loaded or validated."""

    message: str = "Failed to load settings"
    exc: Exception | None = None

    def __str__(self) -> str:
        """Return error message payload."""
        return f"{self.message}: {self.exc}" if self.exc else self.message


@dataclass
class AsyncExecutionError(PackageError):
    """Raised when an async operation fails in compatibility runner."""

    result: BaseException
    message: str = "Async operation failed"

    def __str__(self) -> str:
        """Return error message payload."""
        return f"{self.message}: {self.result}"
