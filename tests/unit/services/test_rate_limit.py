from __future__ import annotations

from brainstorm_agent.core.enums import AuthMode
from brainstorm_agent.core.models import AuthenticatedPrincipal
from brainstorm_agent.services.rate_limit import InMemoryRateLimiter, build_rate_limit_identifier


def test_in_memory_rate_limiter_blocks_after_limit() -> None:
    limiter = InMemoryRateLimiter()

    first_allowed, first_retry = limiter.check(identifier="client-1", limit=1, window_seconds=60)
    second_allowed, second_retry = limiter.check(identifier="client-1", limit=1, window_seconds=60)

    assert first_allowed is True
    assert first_retry == 0
    assert second_allowed is False
    assert second_retry >= 1


def test_rate_limit_identifier_prefers_principal_subject() -> None:
    principal = AuthenticatedPrincipal(subject="user-1", auth_mode=AuthMode.JWT)

    identifier = build_rate_limit_identifier(principal=principal, client_host="127.0.0.1")

    assert identifier == "user-1"
