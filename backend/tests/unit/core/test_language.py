from __future__ import annotations

import pytest

from brainstorm_agent.core.enums import Language
from brainstorm_agent.core.language import detect_language, session_language


@pytest.mark.parametrize(
    ("texts", "expected"),
    [
        (["Je veux une application pour gérer les tournées de nos livreurs."], Language.FR),
        (["I want an app to plan the routes of our delivery drivers."], Language.EN),
        (["", "pitch: Un outil de cadrage pour les équipes produit."], Language.FR),
        ([], Language.EN),
    ],
)
def test_session_language_is_detected_from_user_text(texts: list[str], expected: Language) -> None:
    assert detect_language(texts) is expected


def test_language_parsing_falls_back_to_english() -> None:
    assert Language.from_string("FR") is Language.FR
    assert Language.from_string("de") is Language.EN


def test_session_language_prefers_the_latest_message_then_earlier_user_turns() -> None:
    transcript = [
        {"role": "user", "content": "Nous voulons un outil pour les équipes."},
        {"role": "assistant", "content": "Which users do you target?"},
    ]
    assert session_language("", transcript) is Language.FR
    assert session_language("We target the sales team.", transcript) is Language.EN
