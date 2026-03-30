"""Runtime settings loaded from `.env` and environment variables."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

from brainstorm_agent.core.enums import LLMMode
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
    prompt_version: str = Field(default="v1", validation_alias="PROMPT_VERSION")
    prompt_base_path: str | None = Field(default=None, validation_alias="PROMPT_BASE_PATH")

    @computed_field
    @property
    def is_sqlite(self) -> bool:
        """Return whether the configured database is SQLite.

        Returns:
            bool: `True` when using SQLite.
        """
        return self.database_url.startswith("sqlite")


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
