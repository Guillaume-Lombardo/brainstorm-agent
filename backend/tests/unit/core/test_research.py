"""Evidence allowlist never admits invented product URLs."""

from brainstorm_agent.core.research import Product, ResearchSynthesis, SearchResult, validate_evidence


def test_unknown_evidence_discarded() -> None:
    result = SearchResult(title="Known", url="https://example.com/known", snippet="Board", provider="fake")
    product = Product(
        name="Invented",
        url="https://example.com/invented",
        summary="Unsupported",
        key_features=[],
        pricing=None,
        evidence_urls=["https://example.com/invented"],
    )
    assert not validate_evidence(
        ResearchSynthesis(products=[product], features=[], assumptions=[], open_questions=[]), [result],
    ).products
