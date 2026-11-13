"""Bounded research orchestration independent of concrete search adapters."""

import asyncio
import json
from typing import TYPE_CHECKING
from uuid import uuid4

from brainstorm_agent.core.enums import LLMMode, Stage
from brainstorm_agent.core.research import (
    Benchmark,
    CandidateFeature,
    Product,
    Recommendation,
    ResearchQueries,
    ResearchSynthesis,
    validate_evidence,
)
from brainstorm_agent.services.llm_client import OpenAICompatibleBrainstormLLM
from brainstorm_agent.services.search import SearchProvider, build_search_provider

if TYPE_CHECKING:
    from brainstorm_agent.core.models import StageState
    from brainstorm_agent.services.session_service import SessionService


async def execute_research(
    service: SessionService,
    stage: StageState,
    version: int,
    provider: SearchProvider | None = None,
) -> Benchmark:
    """Generate queries, search snippets, synthesize and enforce evidence provenance.

    Args:
        service (SessionService): Application dependencies.
        stage (StageState): Stage 1 snapshot.
        version (int): Next execution version.
        provider (SearchProvider | None): Test override.

    Returns:
        Benchmark: Validated execution, never applied to framing automatically.
    """
    provider = provider or build_search_provider(service.settings)
    fields = stage.extracted_fields.model_dump(exclude_none=True)
    llm = service.llm
    try:
        if service.settings.llm_mode is LLMMode.FAKE:
            queries = ResearchQueries(
                queries=[
                    f"{fields.get('problem_statement', 'project framing')} {term}"[:500]
                    for term in ["software", "alternatives", "features"]
                ],
            )
        else:
            assert isinstance(llm, OpenAICompatibleBrainstormLLM)  # noqa: S101 - Factory invariant
            queries = ResearchQueries.model_validate(
                await llm._structured(  # noqa: SLF001 - Shared bounded structured adapter
                    stage=Stage.STAGE_1_PROBLEM_FRAMING,
                    model=ResearchQueries,
                    prompt="\n\n".join([
                        service.prompt_loader.research_prompt("queries"),
                        "Output JSON schema: " + json.dumps(ResearchQueries.model_json_schema()),
                        "Framing: " + json.dumps(fields),
                    ]),
                ),
            )
        results = []
        async with asyncio.timeout(5 * service.settings.search_timeout_seconds):
            for query in queries.queries:
                results.extend(await provider.search(query[:500]))
        results = list({str(item.url): item for item in results}.values())
        if service.settings.llm_mode is LLMMode.FAKE:
            products = [
                Product(
                    name=item.title,
                    url=item.url,
                    summary=item.snippet,
                    key_features=["Shared framing", "Markdown export"],
                    pricing=None,
                    evidence_urls=[item.url],
                )
                for item in results
            ]
            synthesis = ResearchSynthesis(
                products=products,
                features=[
                    CandidateFeature(
                        feature=feature,
                        products=[item.name for item in products],
                        recommendation=Recommendation.ADAPT,
                        justification="Hypothesis: useful for the framed workflow; confirm with users.",
                        evidence_urls=[item.url for item in results],
                    )
                    for feature in ["Shared framing", "Markdown export"]
                ],
                assumptions=["Suitability for this project needs user confirmation."],
                open_questions=["Which features should be retained?"],
            )
        else:
            assert isinstance(llm, OpenAICompatibleBrainstormLLM)  # noqa: S101 - Factory invariant
            synthesis = ResearchSynthesis.model_validate(
                await llm._structured(  # noqa: SLF001 - Shared bounded structured adapter
                    stage=Stage.STAGE_1_PROBLEM_FRAMING,
                    model=ResearchSynthesis,
                    prompt="\n\n".join([
                        service.prompt_loader.research_prompt("synthesis"),
                        "Output JSON schema: " + json.dumps(ResearchSynthesis.model_json_schema()),
                        json.dumps({
                            "framing": fields,
                            "evidence": [item.model_dump(mode="json") for item in results],
                        }),
                    ]),
                ),
            )
        return Benchmark(
            id=str(uuid4()),
            version=version,
            queries=queries.queries,
            results=results,
            synthesis=validate_evidence(synthesis, results),
        )
    finally:
        if isinstance(llm, OpenAICompatibleBrainstormLLM):
            await llm.client.close()
