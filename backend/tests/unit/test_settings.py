from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from brainstorm_agent.core.enums import AuthMode, ChallengePass
from brainstorm_agent.settings import Settings, get_settings

if TYPE_CHECKING:
    from pathlib import Path


def test_settings_load_from_env_file(tmp_path: Path, monkeypatch) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("APP_ENV=test\nLOG_LEVEL=DEBUG\nLOG_JSON=false\n", encoding="utf-8")
    monkeypatch.chdir(tmp_path)

    settings = Settings()

    assert settings.app_env == "test"
    assert settings.log_level == "DEBUG"
    assert settings.log_json is False


def test_get_settings_uses_environment(monkeypatch) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("APP_ENV", "ci")

    settings = get_settings()
    assert settings.app_env == "ci"

    get_settings.cache_clear()


def test_settings_parse_hashed_api_keys_from_env(monkeypatch) -> None:
    monkeypatch.setenv("ENABLE_AUTH", "true")
    monkeypatch.setenv("AUTH_MODE", "api_key")
    monkeypatch.setenv("AUTH_API_KEY_HASHES", "hash-1,hash-2")

    settings = Settings()

    assert settings.auth_api_key_hashes == ["hash-1", "hash-2"]
    assert settings.effective_auth_mode is AuthMode.API_KEY


def test_settings_require_jwt_secret_for_jwt_mode() -> None:
    with pytest.raises(ValueError, match="JWT auth requires JWT_SECRET_KEY"):
        Settings(enable_auth=True, auth_mode=AuthMode.JWT)


def test_settings_skip_mode_specific_validation_when_auth_disabled() -> None:
    settings = Settings(enable_auth=False, auth_mode=AuthMode.JWT)

    assert settings.effective_auth_mode is AuthMode.NONE


@pytest.mark.parametrize(("challenge", "calls"), [("off", 3), ("findings", 5)])
def test_session_lock_exceeds_all_call_timeouts(challenge, calls):
    with pytest.raises(ValueError, match="worst-case"):
        Settings(
            llm_challenge_pass=challenge,
            openai_timeout_seconds=10,
            redis_lock_timeout_seconds=calls * 10,
        )
    assert Settings(
        llm_challenge_pass=challenge,
        openai_timeout_seconds=10,
        redis_lock_timeout_seconds=calls * 10 + 1,
    )


def test_output_budget_defaults_to_32k() -> None:
    assert Settings().llm_max_tokens == 32768


def test_deployment_lock_covers_five_slow_calls() -> None:
    def slow(lock: int) -> Settings:
        return Settings(
            llm_challenge_pass=ChallengePass.FINDINGS,
            openai_timeout_seconds=300,
            redis_lock_timeout_seconds=lock,
        )

    assert slow(1800).redis_lock_timeout_seconds == 1800
    with pytest.raises(ValueError, match="worst-case"):
        slow(900)


@pytest.mark.parametrize(
    "origin",
    [
        "*",
        "null",
        "https://example.com/path",
        "https://user:pass@example.com",  # pragma: allowlist secret
        "https://example.com?query=1",
    ],  # pragma: allowlist secret
)
def test_cors_rejects_non_origin_allowlist_entries(origin: str) -> None:
    with pytest.raises(ValueError, match="CORS origins"):
        Settings(cors_origins=[origin])


def test_cors_accepts_explicit_origins() -> None:
    assert Settings(cors_origins=["http://localhost:3000", "https://example.com"]).cors_origins == [
        "http://localhost:3000",
        "https://example.com",
    ]
