"""Typed benchmark contracts and deterministic evidence validation."""

from enum import StrEnum
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class Recommendation(StrEnum):
    """Owner-facing recommendation, never an automatic decision."""

    ADOPT = "adopt"
    ADAPT = "adapt"
    SKIP = "skip"


class SearchResult(BaseModel):
    """Normalized snippet; pages are never fetched."""

    title: str
    url: HttpUrl
    snippet: str
    provider: str


class Product(BaseModel):
    """Sourced observations of an existing product."""

    model_config = ConfigDict(extra="forbid")
    name: str
    url: HttpUrl
    summary: str
    key_features: list[str]
    pricing: str | None
    evidence_urls: list[HttpUrl]


class CandidateFeature(BaseModel):
    """An inferred recommendation requiring explicit owner selection."""

    model_config = ConfigDict(extra="forbid")
    id: str = Field(default_factory=lambda: str(uuid4()))
    feature: str
    products: list[str]
    recommendation: Recommendation
    justification: str
    evidence_urls: list[HttpUrl]


class ResearchQueries(BaseModel):
    """Bounded search plan based on stage 1 fields."""

    model_config = ConfigDict(extra="forbid")
    queries: list[str] = Field(min_length=3, max_length=5)


class ResearchSynthesis(BaseModel):
    """Untrusted model synthesis, checked against actual search evidence."""

    model_config = ConfigDict(extra="forbid")
    products: list[Product] = Field(max_length=20)
    features: list[CandidateFeature] = Field(max_length=40)
    assumptions: list[str]
    open_questions: list[str]


class Benchmark(BaseModel):
    """Immutable execution result with separately editable owner selection."""

    id: str
    version: int
    queries: list[str]
    results: list[SearchResult]
    synthesis: ResearchSynthesis
    selected_ids: list[str] = Field(default_factory=list)


class FeatureSelection(BaseModel):
    """Replacement selection for a specific benchmark version."""

    selected_ids: list[str] = Field(max_length=40)


def validate_evidence(synthesis: ResearchSynthesis, results: list[SearchResult]) -> ResearchSynthesis:
    """Discard products and candidates without known evidence and product references.

    Args:
        synthesis (ResearchSynthesis): Untrusted synthesis.
        results (list[SearchResult]): Actual provider responses.

    Returns:
        ResearchSynthesis: Filtered synthesis with fresh server-generated candidate ids.
    """
    allowed = {str(item.url) for item in results}
    products = [
        item
        for item in synthesis.products
        if item.evidence_urls
        and str(item.url) in allowed
        and {str(url) for url in item.evidence_urls} <= allowed
    ]
    names = {item.name for item in products}
    features = [
        item.model_copy(update={"id": str(uuid4())})
        for item in synthesis.features
        if item.evidence_urls
        and item.products
        and set(item.products) <= names
        and {str(url) for url in item.evidence_urls} <= allowed
    ]
    return synthesis.model_copy(update={"products": products, "features": features})


def render_benchmark(benchmarks: list[Benchmark]) -> str:
    """Render the latest execution with explicit evidence and decision separation.

    Args:
        benchmarks (list[Benchmark]): Ordered execution history.

    Returns:
        str: Markdown section, or empty text before the first execution.
    """
    if not benchmarks:
        return ""
    benchmark = benchmarks[-1]
    lines = ["\n\n## Benchmark", f"\nVersion: {benchmark.version}", "\n### Facts (sourced snippets)"]
    for product in benchmark.synthesis.products:
        lines.append(f"- [{product.name}]({product.url}): {product.summary}")
        lines.extend(f"  - Evidence: {url}" for url in product.evidence_urls)
        lines.extend(f"  - {feature}" for feature in product.key_features)
        if product.pricing:
            lines.append(f"  - Pricing (as reported): {product.pricing}")
    lines.append("\n### Assumptions (to confirm)")
    lines.extend(f"- {text}" for text in benchmark.synthesis.assumptions)
    lines.extend(
        f"- {item.feature}: {item.recommendation.value} — {item.justification}"
        for item in benchmark.synthesis.features
    )
    lines.append("\n### Decisions (owner selected)")
    lines.extend(
        f"- {item.feature}" for item in benchmark.synthesis.features if item.id in benchmark.selected_ids
    )
    lines.append("\n### Open questions")
    lines.extend(f"- {text}" for text in benchmark.synthesis.open_questions)
    return "\n".join(lines) + "\n"
