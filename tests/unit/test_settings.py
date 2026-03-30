from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from brainstorm_agent.core.enums import AuthMode
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
