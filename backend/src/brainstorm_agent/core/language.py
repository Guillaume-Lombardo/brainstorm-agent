"""Deterministic detection of the session language from user text."""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

from brainstorm_agent.core.enums import Language

if TYPE_CHECKING:
    from collections.abc import Iterable

_WORD = re.compile(r"[a-zà-ÿœæ']+")
_FRENCH_LETTERS = frozenset("àâçéèêëîïôûùüÿœæ")
_MARKERS = {
    Language.FR: frozenset(
        [
            "le",
            "la",
            "les",
            "un",
            "une",
            "des",
            "du",
            "de",
            "au",
            "aux",
            "et",
            "est",
            "sont",
            "pour",
            "avec",
            "dans",
            "sur",
            "par",
            "pas",
            "que",
            "qui",
            "quoi",
            "nous",
            "vous",
            "je",
            "il",
            "elle",
            "ils",
            "notre",
            "nos",
            "votre",
            "vos",
            "mon",
            "ma",
            "mes",
            "ce",
            "cette",
            "ces",
            "leur",
            "leurs",
            "être",
            "avoir",
            "faut",
            "veut",
            "veux",
            "doit",
            "peut",
            "aussi",
            "mais",
            "ou",
            "où",
            "comme",
            "plus",
            "très",
            "sans",
            "chez",
        ],
    ),
    Language.EN: frozenset(
        [
            "the",
            "an",
            "and",
            "is",
            "are",
            "for",
            "with",
            "in",
            "by",
            "not",
            "that",
            "which",
            "what",
            "who",
            "we",
            "you",
            "it",
            "they",
            "our",
            "your",
            "my",
            "this",
            "these",
            "those",
            "their",
            "be",
            "have",
            "has",
            "must",
            "should",
            "can",
            "also",
            "but",
            "or",
            "as",
            "more",
            "very",
            "without",
            "to",
            "of",
            "from",
            "will",
            "would",
        ],
    ),
}


def _scores(text: str) -> dict[Language, int]:
    words = _WORD.findall(text.casefold())
    scores = {language: sum(word in markers for word in words) for language, markers in _MARKERS.items()}
    scores[Language.FR] += sum(char in _FRENCH_LETTERS for char in text.casefold())
    return scores


def detect_language(texts: Iterable[str]) -> Language:
    """Return the language of the first text that is clearly French or English.

    Args:
        texts (Iterable[str]): User texts, most relevant first.

    Returns:
        Language: Detected language, English when undecided.
    """
    for text in texts:
        scores = _scores(text)
        if scores[Language.FR] != scores[Language.EN]:
            return max(scores, key=scores.__getitem__)
    return Language.EN


def session_language(user_message: str, transcript: Iterable[dict[str, str]]) -> Language:
    """Detect the language from the latest message, then from earlier user turns.

    Args:
        user_message (str): Latest user message (empty for direct edits).
        transcript (Iterable[dict[str, str]]): Bounded conversation transcript.

    Returns:
        Language: Session language for deterministic wording.
    """
    earlier = [turn.get("content", "") for turn in transcript if turn.get("role") == "user"]
    return detect_language([user_message, *reversed(earlier)])
