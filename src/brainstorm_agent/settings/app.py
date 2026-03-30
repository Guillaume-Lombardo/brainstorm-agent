"""Runtime settings loaded from `.env` and environment variables."""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from pydantic import Field, computed_field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

from brainstorm_agent.core.enums import AuthMode, LLMMode
from brainstorm_agent.exceptions import SettingsError


class Settings(BaseSettings):
    """Application settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    project_name: str = "brainstorm-agent"
    app_env: str = Field(default="dev", validation_alias="APP_ENV")
    api_v1_prefix: str = "/api/v1"
    host: str = Field(default="127.0.0.1", validation_alias="HOST")
    port: int = Field(default=8000, validation_alias="PORT")
    enable_auth: bool = Field(default=False, validation_alias="ENABLE_AUTH")
    auth_mode: AuthMode = Field(default=AuthMode.NONE, validation_alias="AUTH_MODE")
    auth_api_keys: Annotated[list[str], NoDecode] = Field(
        default_factory=list,
        validation_alias="AUTH_API_KEYS",
    )
    auth_api_key_hashes: Annotated[list[str], NoDecode] = Field(
        default_factory=list,
        validation_alias="AUTH_API_KEY_HASHES",
    )
    jwt_secret_key: str | None = Field(default=None, validation_alias="JWT_SECRET_KEY")
    jwt_algorithm: str = Field(default="HS256", validation_alias="JWT_ALGORITHM")
    jwt_audience: str | None = Field(default=None, validation_alias="JWT_AUDIENCE")
    jwt_issuer: str | None = Field(default=None, validation_alias="JWT_ISSUER")

    log_level: str = Field(default="INFO", validation_alias="LOG_LEVEL")
    log_json: bool = Field(default=True, validation_alias="LOG_JSON")
    log_file: str | None = Field(default=None, validation_alias="LOG_FILE")

    database_url: str = Field(
        default="sqlite+pysqlite:///./brainstorm_agent.db",
        validation_alias="DATABASE_URL",
    )
    redis_url: str = Field(default="redis://redis:6379/0", validation_alias="REDIS_URL")
    redis_lock_timeout_seconds: float = Field(
        default=30.0,
        validation_alias="REDIS_LOCK_TIMEOUT_SECONDS",
    )
    redis_lock_blocking_timeout_seconds: float = Field(
        default=5.0,
        validation_alias="REDIS_LOCK_BLOCKING_TIMEOUT_SECONDS",
    )

    llm_mode: LLMMode = Field(default=LLMMode.HEURISTIC, validation_alias="LLM_MODE")
    openai_base_url: str | None = Field(default=None, validation_alias="OPENAI_BASE_URL")
    openai_api_key: str | None = Field(default=None, validation_alias="OPENAI_API_KEY")
    model_name: str = Field(default="gpt-4.1-mini", validation_alias="MODEL_NAME")
    openai_timeout_seconds: float = Field(default=30.0, validation_alias="OPENAI_TIMEOUT_SECONDS")
    openai_facade_model_name: str = Field(
        default="brainstorm-agent",
        validation_alias="OPENAI_FACADE_MODEL_NAME",
    )
    require_human_validation_for_transitions: bool = Field(
        default=False,
        validation_alias="REQUIRE_HUMAN_VALIDATION_FOR_TRANSITIONS",
    )
    auto_create_schema: bool = Field(default=True, validation_alias="AUTO_CREATE_SCHEMA")
    run_db_migrations_on_startup: bool = Field(
        default=False,
        validation_alias="RUN_DB_MIGRATIONS_ON_STARTUP",
    )
    rate_limit_enabled: bool = Field(default=False, validation_alias="RATE_LIMIT_ENABLED")
    rate_limit_requests: int = Field(default=60, validation_alias="RATE_LIMIT_REQUESTS")
    rate_limit_window_seconds: int = Field(default=60, validation_alias="RATE_LIMIT_WINDOW_SECONDS")
    rate_limit_namespace: str = Field(default="brainstorm-agent", validation_alias="RATE_LIMIT_NAMESPACE")
    prompt_version: str = Field(default="v1", validation_alias="PROMPT_VERSION")
    prompt_base_path: str | None = Field(default=None, validation_alias="PROMPT_BASE_PATH")

    @field_validator("auth_api_keys", mode="before")
    @classmethod
    def _split_auth_api_keys(cls, value: object) -> object:
        """Parse auth API keys from a comma-separated environment variable.

        Args:
            value: Raw environment value.

        Returns:
            object: Parsed list or original value.
        """
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("auth_api_key_hashes", mode="before")
    @classmethod
    def _split_auth_api_key_hashes(cls, value: object) -> object:
        """Parse hashed API keys from a comma-separated environment variable.

        Args:
            value: Raw environment value.

        Returns:
            object: Parsed list or original value.
        """
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @staticmethod
    def _auth_mode_disabled_error() -> str:
        return "AUTH_MODE must not be 'none' when ENABLE_AUTH=true."

    @staticmethod
    def _api_key_auth_error() -> str:
        return "API key auth requires AUTH_API_KEYS or AUTH_API_KEY_HASHES."

    @staticmethod
    def _jwt_auth_error() -> str:
        return "JWT auth requires JWT_SECRET_KEY."

    @staticmethod
    def _hybrid_auth_error() -> str:
        return "HYBRID auth requires JWT_SECRET_KEY and AUTH_API_KEYS or AUTH_API_KEY_HASHES."

    @staticmethod
    def _rate_limit_error() -> str:
        return "RATE_LIMIT_REQUESTS must be greater than zero."

    @model_validator(mode="after")
    def _validate_security_settings(self) -> Settings:
        """Validate auth and rate-limit configuration coherence.

        Returns:
            Settings: Validated settings instance.

        Raises:
            ValueError: If the configuration is inconsistent.
        """
        if self.enable_auth and self.auth_mode is AuthMode.NONE:
            raise ValueError(self._auth_mode_disabled_error())
        if self.auth_mode is AuthMode.API_KEY and not (self.auth_api_keys or self.auth_api_key_hashes):
            raise ValueError(self._api_key_auth_error())
        if self.auth_mode is AuthMode.JWT and not self.jwt_secret_key:
            raise ValueError(self._jwt_auth_error())
        if self.auth_mode is AuthMode.HYBRID and not (
            self.jwt_secret_key and (self.auth_api_keys or self.auth_api_key_hashes)
        ):
            raise ValueError(self._hybrid_auth_error())
        if self.rate_limit_enabled and self.rate_limit_requests <= 0:
            raise ValueError(self._rate_limit_error())
        return self

    @computed_field
    @property
    def is_sqlite(self) -> bool:
        """Return whether the configured database is SQLite.

        Returns:
            bool: `True` when using SQLite.
        """
        return self.database_url.startswith("sqlite")

    @computed_field
    @property
    def effective_auth_mode(self) -> AuthMode:
        """Return the effective auth mode derived from feature flags.

        Returns:
            AuthMode: Effective authentication mode.
        """
        if not self.enable_auth:
            return AuthMode.NONE
        return self.auth_mode


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached settings instance.

    Returns:
        Settings: The loaded settings instance.

    Raises:
        SettingsError: If settings cannot be loaded or validated.
    """
    try:
        return Settings()
    except Exception as exc:
        raise SettingsError(exc=exc) from exc
