"""Package exceptions."""

from __future__ import annotations

from dataclasses import dataclass

MISSING_USER_MESSAGE_ERROR = "The request must include at least one user message with text content."


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
class ConflictError(PackageError):
    """Raised when the requested operation conflicts with current state."""

    message: str

    @classmethod
    def no_pending_human_review(cls) -> ConflictError:
        """Build a missing-pending-review conflict error.

        Returns:
            ConflictError: Conflict for absent pending review.
        """
        return cls(message="This session has no pending human review.")

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
class LLMResponseError(PackageError):
    """Raised when an LLM response cannot be parsed into the expected schema."""

    stage: str
    message: str = "The LLM response could not be parsed."
    raw_output_excerpt: str | None = None

    def __str__(self) -> str:
        """Return error message payload."""
        if self.raw_output_excerpt:
            return f"{self.message} stage={self.stage} raw_output_excerpt={self.raw_output_excerpt!r}"
        return f"{self.message} stage={self.stage}"


@dataclass
class LockAcquisitionError(PackageError):
    """Raised when a session-scoped lock cannot be acquired in time."""

    session_id: str
    message: str = "Timed out while waiting for the session lock."

    def __str__(self) -> str:
        """Return error message payload."""
        return f"{self.message} session_id={self.session_id}"


@dataclass
class UnsupportedOpenAIModelError(PackageError):
    """Raised when the OpenAI-compatible facade receives an unknown model alias."""

    requested_model: str
    available_model: str
    message: str = "The requested OpenAI-compatible model is not available."

    def __str__(self) -> str:
        """Return error message payload."""
        return (
            f"{self.message} requested_model={self.requested_model!r} "
            f"available_model={self.available_model!r}"
        )


@dataclass
class InvalidOpenAIRequestError(PackageError):
    """Raised when the OpenAI-compatible facade request payload is invalid."""

    message: str = "The OpenAI-compatible request payload is invalid."

    @classmethod
    def missing_user_message(cls) -> InvalidOpenAIRequestError:
        """Build a missing-user-message error.

        Returns:
            InvalidOpenAIRequestError: Request validation error.
        """
        return cls(message=MISSING_USER_MESSAGE_ERROR)

    def __str__(self) -> str:
        """Return error message payload."""
        return self.message


@dataclass
class AsyncExecutionError(PackageError):
    """Raised when an async operation fails in compatibility runner."""

    result: BaseException
    message: str = "Async operation failed"

    def __str__(self) -> str:
        """Return error message payload."""
        return f"{self.message}: {self.result}"
