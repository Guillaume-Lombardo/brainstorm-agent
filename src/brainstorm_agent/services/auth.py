"""Authentication helpers for API security."""

from __future__ import annotations

from hashlib import sha256
from hmac import new as hmac_new
from secrets import compare_digest
from typing import TYPE_CHECKING

import jwt
from jwt import InvalidTokenError

from brainstorm_agent.core.enums import AuthMode
from brainstorm_agent.core.models import AuthenticatedPrincipal

if TYPE_CHECKING:
    from brainstorm_agent.settings import Settings


LEGACY_HASH_PREFIX = "sha256"
VERSIONED_HASH_PREFIX = "v1"


def hash_api_key(raw_value: str, pepper: str | None = None) -> str:
    """Hash an API key for storage and comparison.

    Args:
        raw_value: Raw API key.
        pepper: Optional server-side secret used to harden stored hashes.

    Returns:
        str: Versioned digest string.
    """
    if pepper:
        digest = hmac_new(
            pepper.encode("utf-8"),
            raw_value.encode("utf-8"),
            digestmod="sha256",
        ).hexdigest()
        return f"{VERSIONED_HASH_PREFIX}${digest}"
    return f"{LEGACY_HASH_PREFIX}${sha256(raw_value.encode('utf-8')).hexdigest()}"


class AuthenticationService:
    """Authenticate API callers using hashed API keys and/or JWT bearer tokens."""

    def __init__(self, settings: Settings) -> None:
        """Initialize the authentication service.

        Args:
            settings: Application settings.
        """
        self.settings = settings

    def hash_api_key(self, raw_value: str) -> str:
        """Hash an API key using the configured storage strategy.

        Args:
            raw_value: Raw API key.

        Returns:
            str: Versioned digest string.
        """
        return hash_api_key(raw_value, pepper=self.settings.auth_api_key_pepper)

    def authenticate(
        self,
        *,
        x_api_key: str | None,
        authorization: str | None,
    ) -> AuthenticatedPrincipal | None:
        """Authenticate the current caller against the configured auth modes.

        Args:
            x_api_key: API key from `X-API-Key`.
            authorization: Authorization header.

        Returns:
            AuthenticatedPrincipal | None: Authenticated principal or `None` when auth is disabled.
        """
        mode = self.settings.effective_auth_mode
        if mode is AuthMode.NONE:
            return None

        key_principal = self._authenticate_api_key(x_api_key)
        jwt_principal = self._authenticate_jwt(authorization)

        if mode is AuthMode.API_KEY:
            return key_principal
        if mode is AuthMode.JWT:
            return jwt_principal
        return key_principal or jwt_principal

    def _authenticate_api_key(self, candidate: str | None) -> AuthenticatedPrincipal | None:
        if not candidate:
            return None
        legacy_candidate_hash = hash_api_key(candidate)
        peppered_candidate_hash = self.hash_api_key(candidate)
        hashes = {self._normalize_hash(expected_hash) for expected_hash in self.settings.auth_api_key_hashes}
        hashes.update(self._normalize_hash(hash_api_key(item)) for item in self.settings.auth_api_keys)
        for expected_hash in hashes:
            matches_peppered = compare_digest(peppered_candidate_hash, expected_hash)
            matches_legacy = compare_digest(legacy_candidate_hash, expected_hash)
            if matches_peppered or matches_legacy:
                matched_hash = peppered_candidate_hash if matches_peppered else legacy_candidate_hash
                key_suffix = matched_hash[-12:]
                return AuthenticatedPrincipal(
                    subject=f"api-key:{key_suffix}",
                    auth_mode=AuthMode.API_KEY,
                    token_id=key_suffix,
                )
        return None

    @staticmethod
    def _normalize_hash(candidate_hash: str) -> str:
        """Normalize stored API key hashes to a versioned format.

        Args:
            candidate_hash: Stored hash string.

        Returns:
            str: Versioned hash string.
        """
        if "$" in candidate_hash:
            return candidate_hash
        return f"{LEGACY_HASH_PREFIX}${candidate_hash}"

    def _authenticate_jwt(self, authorization: str | None) -> AuthenticatedPrincipal | None:
        if not authorization or not authorization.startswith("Bearer "):
            return None
        if not self.settings.jwt_secret_key:
            return None
        token = authorization.removeprefix("Bearer ").strip()
        if not token:
            return None
        try:
            payload = jwt.decode(
                token,
                key=self.settings.jwt_secret_key,
                algorithms=[self.settings.jwt_algorithm],
                audience=self.settings.jwt_audience,
                issuer=self.settings.jwt_issuer,
            )
        except InvalidTokenError:
            return None
        if "sub" not in payload:
            return None
        subject = str(payload["sub"])
        raw_scopes = payload.get("scope", "")
        scopes = [scope for scope in str(raw_scopes).split(" ") if scope] if raw_scopes else []
        token_id = str(payload["jti"]) if payload.get("jti") else None
        return AuthenticatedPrincipal(
            subject=subject,
            auth_mode=AuthMode.JWT,
            token_id=token_id,
            scopes=scopes,
        )
