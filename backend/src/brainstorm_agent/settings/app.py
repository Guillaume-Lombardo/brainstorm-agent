"""Runtime settings loaded from `.env` and environment variables."""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated
from urllib.parse import urlsplit

from pydantic import Field, computed_field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

from brainstorm_agent.core.enums import AuthMode, ChallengePass, LLMMode, StructuredOutputMode
from brainstorm_agent.exceptions import SettingsError
from brainstorm_agent.services.search import SearchProviderName


class Settings(BaseSettings):
    """Application settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    @field_validator("cors_origins")
    @classmethod
    def validate_cors_origins(cls, values: list[str]) -> list[str]:
        """Require explicit HTTP origins without credentials, paths or wildcards.

        Args:
            values (list[str]): Configured browser origins.

        Returns:
            list[str]: Validated explicit origins.

        Raises:
            ValueError: An origin is not an explicit HTTP origin.
        """
        for value in values:
            parsed = urlsplit(value)
            if any((
                parsed.scheme not in {"http", "https"},
                not parsed.hostname,
                "*" in value,
                bool(parsed.username),
                bool(parsed.password),
                bool(parsed.path),
                bool(parsed.query),
                bool(parsed.fragment),
            )):
                message = "CORS origins must be explicit HTTP origins."
                raise ValueError(message)
            _ = parsed.port
        return values

    project_name: str = "brainstorm-agent"
    app_env: str = Field(default="dev", validation_alias="APP_ENV")
    cors_origins: list[str] = Field(default_factory=list)
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
    auth_api_key_pepper: str | None = Field(default=None, validation_alias="AUTH_API_KEY_PEPPER")
    auth_api_key_owners: dict[str, str] = Field(default_factory=dict, validation_alias="AUTH_API_KEY_OWNERS")
    auth_bridge_secret: str | None = Field(default=None, validation_alias="AUTH_BRIDGE_SECRET")
    oidc_issuer: str | None = Field(default=None, validation_alias="OIDC_ISSUER")
    login_rate_limit_requests: int = Field(default=5, gt=0, validation_alias="LOGIN_RATE_LIMIT_REQUESTS")
    login_rate_limit_window_seconds: int = Field(
        default=60,
        gt=0,
        validation_alias="LOGIN_RATE_LIMIT_WINDOW_SECONDS",
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
        default=210.0,
        validation_alias="REDIS_LOCK_TIMEOUT_SECONDS",
    )
    redis_lock_blocking_timeout_seconds: float = Field(
        default=5.0,
        validation_alias="REDIS_LOCK_BLOCKING_TIMEOUT_SECONDS",
    )

    search_provider: SearchProviderName = SearchProviderName.NONE
    searxng_base_url: str = ""
    tavily_api_key: str | None = Field(default=None, repr=False)
    tavily_search_url: str = "https://api.tavily.com/search"
    brave_api_key: str | None = Field(default=None, repr=False)
    brave_search_url: str = "https://api.search.brave.com/res/v1/web/search"
    litellm_search_api_key: str | None = Field(default=None, repr=False)
    litellm_search_url: str = ""
    search_tool_name: str = ""
    search_timeout_seconds: float = Field(default=20, gt=0, le=60)

    @model_validator(mode="after")
    def _validate_search(self) -> Settings:
        """Validate required search routing at startup.

        Returns:
            Settings: Validated settings.

        Raises:
            ValueError: Missing required configuration or unsafe fake mode.
        """
        required = {
            SearchProviderName.SEARXNG: ["searxng_base_url"],
            SearchProviderName.TAVILY: ["tavily_api_key", "tavily_search_url"],
            SearchProviderName.BRAVE: ["brave_api_key", "brave_search_url"],
            SearchProviderName.LITELLM: ["litellm_search_api_key", "litellm_search_url", "search_tool_name"],
        }
        for name in required.get(self.search_provider, []):
            if not getattr(self, name):
                raise ValueError(f"SEARCH_PROVIDER={self.search_provider} requires {name.upper()}")  # noqa: TRY003 - Sanitized actionable application error
            if name.endswith(("url", "base_url")) and urlsplit(getattr(self, name)).scheme not in {
                "http",
                "https",
            }:
                raise ValueError(f"{name.upper()} must use HTTP or HTTPS")  # noqa: TRY003 - Sanitized actionable application error
        if self.search_provider is SearchProviderName.FAKE and self.llm_mode is not LLMMode.FAKE:
            raise ValueError("SEARCH_PROVIDER=fake requires LLM_MODE=fake")  # noqa: TRY003 - Sanitized actionable application error
        return self

    llm_mode: LLMMode = Field(default=LLMMode.OPENAI, validation_alias="LLM_MODE")
    llm_output_mode: StructuredOutputMode = Field(
        default=StructuredOutputMode.JSON_SCHEMA,
        validation_alias="LLM_OUTPUT_MODE",
    )
    llm_challenge_pass: ChallengePass = Field(
        default=ChallengePass.OFF,
        validation_alias="LLM_CHALLENGE_PASS",
    )
    llm_context_turns: int = Field(default=8, ge=0, validation_alias="LLM_CONTEXT_TURNS")
    llm_max_tokens: int = Field(default=32768, gt=0, validation_alias="LLM_MAX_TOKENS")
    openai_base_url: str | None = Field(default=None, validation_alias="OPENAI_BASE_URL")
    openai_api_key: str | None = Field(default=None, validation_alias="OPENAI_API_KEY")
    model_name: str = Field(default="gpt-4.1-mini", validation_alias="MODEL_NAME")
    openai_timeout_seconds: float = Field(default=30.0, gt=0, validation_alias="OPENAI_TIMEOUT_SECONDS")
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
    prompt_version: str = Field(default="v2", validation_alias="PROMPT_VERSION")
    prompt_base_path: str | None = Field(default=None, validation_alias="PROMPT_BASE_PATH")

    def validate_provider_configuration(self) -> None:
        """Require explicit provider routing before constructing a network client.

        Raises:
            ValueError: If openai mode has no explicit URL or credential.
        """
        if self.llm_mode is LLMMode.OPENAI and not (self.openai_base_url and self.openai_api_key):
            raise ValueError(self._provider_configuration_error())

    @staticmethod
    def _provider_configuration_error() -> str:
        return "LLM_MODE=openai requires explicit OPENAI_BASE_URL and OPENAI_API_KEY. Configure the provider or select LLM_MODE=fake."

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

    @staticmethod
    def _lock_timeout_error() -> str:
        return "REDIS_LOCK_TIMEOUT_SECONDS must exceed the worst-case turn duration (analysis retry, optional challenge retry, reply, final document; 4 calls, or 6 with findings)."

    @model_validator(mode="after")
    def _validate_security_settings(self) -> Settings:
        """Validate auth and rate-limit configuration coherence.

        Returns:
            Settings: Validated settings instance.

        Raises:
            ValueError: If the configuration is inconsistent.
        """
        calls = 6 if self.llm_challenge_pass is ChallengePass.FINDINGS else 4
        if self.redis_lock_timeout_seconds <= calls * self.openai_timeout_seconds:
            raise ValueError(self._lock_timeout_error())
        effective_mode = self.effective_auth_mode

        if self.enable_auth and self.auth_mode is AuthMode.NONE:
            raise ValueError(self._auth_mode_disabled_error())
        if effective_mode is AuthMode.API_KEY and not (self.auth_api_keys or self.auth_api_key_hashes):
            raise ValueError(self._api_key_auth_error())
        if effective_mode is AuthMode.JWT and not self.jwt_secret_key:
            raise ValueError(self._jwt_auth_error())
        if effective_mode is AuthMode.HYBRID and not (
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
