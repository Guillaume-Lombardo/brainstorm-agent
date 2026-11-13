"""Evidence allowlist never admits invented product URLs."""

from pydantic import HttpUrl

from brainstorm_agent.core.research import Product, ResearchSynthesis, SearchResult, validate_evidence


def test_unknown_evidence_discarded() -> None:
    result = SearchResult(
        title="Known",
        url=HttpUrl("https://example.com/known"),
        snippet="Board",
        provider="fake",
    )
    product = Product(
        name="Invented",
        url=HttpUrl("https://example.com/invented"),
        summary="Unsupported",
        key_features=[],
        pricing=None,
        evidence_urls=[HttpUrl("https://example.com/invented")],
    )
    assert not validate_evidence(
        ResearchSynthesis(products=[product], features=[], assumptions=[], open_questions=[]),
        [result],
    ).products
