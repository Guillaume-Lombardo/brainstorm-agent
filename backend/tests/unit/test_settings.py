from __future__ import annotations

import re
from pathlib import Path

import pytest
import yaml
from dotenv import dotenv_values

from brainstorm_agent.core.enums import AuthMode, ChallengePass
from brainstorm_agent.settings import Settings, get_settings


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


@pytest.mark.parametrize(("challenge", "calls"), [("off", 4), ("findings", 6)])
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


def test_deployment_lock_requires_room_for_six_slow_calls() -> None:
    def slow(lock: int) -> Settings:
        return Settings(
            llm_challenge_pass=ChallengePass.FINDINGS,
            openai_timeout_seconds=300,
            redis_lock_timeout_seconds=lock,
        )

    assert slow(2100).redis_lock_timeout_seconds == 2100
    with pytest.raises(ValueError, match="final document"):
        slow(1800)
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


@pytest.mark.parametrize(
    "compose",
    [
        "docker-compose.yml",
        "docker-compose.prod.yml",
        "deploy/docker-box/compose.yaml",
    ],
)
def test_deployment_timeout_defaults_remain_valid(compose: str):
    root = Path(__file__).resolve().parents[3]
    values = dotenv_values(root / "backend/.env.template")
    config = yaml.safe_load((root / compose).read_text())
    values.update(config["x-backend-env"])
    timeouts = {
        key: re.sub(r"\$\{[^}]+:-(.*?)\}", r"\1", str(values[key]))
        for key in ("OPENAI_TIMEOUT_SECONDS", "REDIS_LOCK_TIMEOUT_SECONDS")
    }
    settings = Settings.model_validate(timeouts)
    assert settings.redis_lock_timeout_seconds > 4 * settings.openai_timeout_seconds
    if compose.endswith("compose.yaml"):
        assert settings.openai_timeout_seconds == 300
        assert settings.redis_lock_timeout_seconds == 1800
        with pytest.raises(ValueError, match="final document"):
            Settings.model_validate({**timeouts, "llm_challenge_pass": ChallengePass.FINDINGS})
    else:
        assert Settings.model_validate({**timeouts, "llm_challenge_pass": ChallengePass.FINDINGS})


def test_environment_template_timeout_defaults_cover_challenge_findings():
    root = Path(__file__).resolve().parents[3]
    values = dotenv_values(root / "backend/.env.template")
    settings = Settings.model_validate({
        **{key: values[key] for key in ("OPENAI_TIMEOUT_SECONDS", "REDIS_LOCK_TIMEOUT_SECONDS")},
        "llm_challenge_pass": ChallengePass.FINDINGS,
    })
    assert settings.redis_lock_timeout_seconds > 6 * settings.openai_timeout_seconds
