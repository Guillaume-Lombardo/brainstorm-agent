import pytest
from argon2 import PasswordHasher

from brainstorm_agent.services.users import hash_password


def test_password_is_salted_argon2id() -> None:
    first = hash_password("example-password")
    assert first.startswith("$argon2id$")
    assert first != hash_password("example-password")
    assert PasswordHasher().verify(first, "example-password")


@pytest.mark.parametrize("password", ["", "x" * 1025])
def test_password_bounds(password: str) -> None:
    with pytest.raises(ValueError, match="Password must contain"):
        hash_password(password)
