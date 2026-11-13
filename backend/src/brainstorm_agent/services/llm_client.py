"""LLM adapters for stage analysis."""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Protocol, cast

from openai import AsyncOpenAI, pydantic_function_tool
from pydantic import BaseModel, ConfigDict, ValidationError, create_model

from brainstorm_agent.core.enums import ChallengePass, LLMMode, Stage, StructuredOutputMode
from brainstorm_agent.core.models import (
    AssistantAnalysis,
    AssumptionItem,
    BrainstormSessionState,
    DecisionItem,
    FactItem,
    OpenQuestionItem,
    RiskItem,
    StageState,
)
from brainstorm_agent.core.quality_rules import reference_catalog
from brainstorm_agent.core.stage_contracts import STAGE_CONTRACTS, STAGE_FIELD_ALIASES, STAGE_MODELS
from brainstorm_agent.core.validation import validate_stage
from brainstorm_agent.exceptions import LLMResponseError

if TYPE_CHECKING:
    from collections.abc import AsyncIterator, Iterable

    from openai.types.chat import ChatCompletionMessageParam

    from brainstorm_agent.services.prompt_loader import PromptLoader
    from brainstorm_agent.settings import Settings


RISK_PART_COUNT = 5


def _split_items(raw: str) -> list[str]:
    """Split a semi-structured list field.

    Args:
        raw: Raw delimited string.

    Returns:
        list[str]: Parsed item list.
    """
    items = [part.strip() for chunk in raw.split(";") for part in chunk.split(",")]
    return [item for item in items if item]


def _default_open_questions(stage: Stage, missing_fields: Iterable[str]) -> list[OpenQuestionItem]:
    """Build generic blocking questions from missing fields.

    Args:
        stage: Active stage.
        missing_fields: Missing required fields.

    Returns:
        list[OpenQuestionItem]: Blocking questions generated from missing fields.
    """
    return [
        OpenQuestionItem(
            question=f"Please clarify `{field_name}` for {stage.label}.",
            why_it_matters="This field is required before the stage can be considered clear enough.",
            blocking=True,
        )
        for field_name in missing_fields
    ]


def _risk_item_from_mapping(item: dict[str, object]) -> RiskItem:
    """Build a risk item from a mapping payload.

    Args:
        item: Mapping payload for one risk.

    Returns:
        RiskItem: Parsed risk item.
    """
    mitigation = str(item.get("mitigation", "TBD"))
    return RiskItem(
        category=str(item.get("category", "general")),
        description=str(item.get("description", "")),
        impact=str(item.get("impact", "medium")),
        probability=str(item.get("probability", "medium")),
        mitigation=mitigation,
        action=str(item.get("action", mitigation)),
    )


def _strip_gate_metadata(value: object) -> None:
    """Remove application-only metadata from the provider schema.

    Args:
        value (object): Schema tree modified in place.
    """
    if isinstance(value, dict):
        cast("dict[str, object]", value).pop("gate_required", None)
        for child in value.values():
            _strip_gate_metadata(child)
    elif isinstance(value, list):
        for child in value:
            _strip_gate_metadata(child)


class BrainstormLLM(Protocol):
    """Async provider boundary."""

    async def analyze(
        self,
        *,
        stage: Stage,
        user_message: str,
        session_state: BrainstormSessionState,
        current_stage_state: StageState | None,
    ) -> AssistantAnalysis:
        """Extract a typed patch."""

    async def challenge(self, *, stage: Stage, analysis: AssistantAnalysis) -> AssistantAnalysis:
        """Return findings without rewriting business values."""

    async def reply(self, *, stage: Stage, analysis: AssistantAnalysis, user_message: str) -> str:
        """Generate a conversational reply."""


@dataclass
class FakeBrainstormLLM:
    """Deterministic fallback implementation for tests and local runs."""

    prompt_loader: PromptLoader
    scripted_responses: list[AssistantAnalysis] = field(default_factory=list)

    async def analyze(
        self,
        *,
        stage: Stage,
        user_message: str,
        session_state: BrainstormSessionState,
        current_stage_state: StageState | None,
    ) -> AssistantAnalysis:
        """Produce a deterministic structured analysis.

        Args:
            stage: Active stage.
            user_message: Latest user message.
            session_state: Current session state.
            current_stage_state: Current stage state snapshot.

        Returns:
            AssistantAnalysis: Deterministic analysis payload.
        """
        if self.scripted_responses:
            return self.scripted_responses.pop(0)
        del session_state
        previous = (
            current_stage_state.extracted_fields.model_dump(exclude_none=True) if current_stage_state else {}
        )
        self.prompt_loader.system_prompt()
        self.prompt_loader.stage_prompt(stage)
        aliases = STAGE_FIELD_ALIASES[stage]
        extracted_fields: dict[str, Any] = {}
        normalized_lines = [line.strip() for line in user_message.splitlines() if line.strip()]

        for field_name, field_aliases in aliases.items():
            extracted = self._extract_by_alias(normalized_lines, field_aliases)
            if extracted is None:
                continue
            if field_name == "event_storming_relevant":
                extracted_fields[field_name] = extracted.lower() in {"true", "yes", "1", "relevant"}
            elif field_name == "risks_by_category":
                extracted_fields[field_name] = self._parse_risk_lines(extracted)
            elif field_name in {
                "pitch_summary",
                "problem_statement",
                "business_goal",
                "not_relevant_reason",
                "five_w_one_h",
            }:
                extracted_fields[field_name] = extracted
            else:
                extracted_fields[field_name] = _split_items(extracted)

        extracted_fields = {**previous, **extracted_fields}
        extracted_fields = self._backlog_fields(stage, extracted_fields)
        facts = [
            FactItem(statement=f"{field_name}: {value}")
            for field_name, value in extracted_fields.items()
            if field_name not in {"hypotheses", "risks_by_category"}
        ]
        assumptions = [
            AssumptionItem(statement=item) for item in self._as_list(extracted_fields.get("hypotheses"))
        ]
        decisions = [
            DecisionItem(statement=item) for item in self._as_list(extracted_fields.get("deliverables"))
        ]
        risks = self._build_risks(extracted_fields)
        missing_fields = [
            field_name
            for field_name in STAGE_CONTRACTS[stage].required_fields
            if field_name not in extracted_fields
        ]
        open_questions = _default_open_questions(stage, missing_fields)
        uncertainties = []
        if "ambiguities" in extracted_fields:
            uncertainties.extend(self._as_list(extracted_fields["ambiguities"]))
        if "missing_information" in extracted_fields:
            uncertainties.extend(self._as_list(extracted_fields["missing_information"]))
        uncertainties.extend(
            [f"Required field `{field_name}` is still missing." for field_name in missing_fields],
        )
        stage_is_clear_enough = not open_questions
        reason = (
            "The fake analysis found no missing blocking field."
            if stage_is_clear_enough
            else "The fake analysis still needs mandatory clarifications."
        )
        assistant_message = (
            "Please answer the blocking questions so we can continue this stage."
            if open_questions
            else f"{stage.label} is clear enough. We can move to the next stage."
        )
        return AssistantAnalysis(
            resolved_question_ids=[item.id for item in current_stage_state.open_questions]
            if current_stage_state
            else [],
            stage=stage,
            summary=self._build_summary(stage, extracted_fields),
            assistant_message=assistant_message,
            facts=facts,
            assumptions=assumptions,
            decisions=decisions,
            uncertainties=uncertainties,
            open_questions=open_questions,
            risks=risks,
            extracted_fields=STAGE_MODELS[stage].model_validate(extracted_fields),
            stage_is_clear_enough=stage_is_clear_enough,
            transition_decision_reason=reason,
        )

    async def challenge(
        self,
        *,
        stage: Stage,
        analysis: AssistantAnalysis,
    ) -> AssistantAnalysis:
        """Refine fake analysis with contradiction signals.

        Args:
            stage: Active stage.
            analysis: Current analysis payload.

        Returns:
            AssistantAnalysis: Refined analysis payload.
        """
        del stage
        self.prompt_loader.contradiction_prompt()
        if not analysis.uncertainties and analysis.open_questions:
            analysis.uncertainties.append("Blocking questions remain unresolved.")
        return analysis

    @staticmethod
    def _extract_by_alias(lines: list[str], aliases: tuple[str, ...]) -> str | None:
        for line in lines:
            if ":" not in line:
                continue
            key, value = line.split(":", maxsplit=1)
            if key.strip().lower() in aliases:
                return value.strip()
        return None

    @staticmethod
    def _as_list(value: object) -> list[str]:
        if value is None:
            return []
        if isinstance(value, list):
            return [str(item) for item in value if str(item).strip()]
        return [str(value)]

    @staticmethod
    def _parse_risk_lines(extracted: str) -> list[dict[str, str]]:
        risks = []
        for chunk in [part.strip() for part in extracted.split(";") if part.strip()]:
            parts = [item.strip() for item in chunk.split("|")]
            if len(parts) != RISK_PART_COUNT:
                continue
            risks.append(
                {
                    "category": parts[0],
                    "description": parts[1],
                    "impact": parts[2],
                    "probability": parts[3],
                    "mitigation": parts[4],
                    "action": parts[4],
                },
            )
        return risks

    @staticmethod
    def _build_risks(extracted_fields: dict[str, object]) -> list[RiskItem]:
        risks_payload = extracted_fields.get("risks_by_category", [])
        if not isinstance(risks_payload, list):
            return []
        return [
            _risk_item_from_mapping(cast("dict[str, object]", item))
            for item in risks_payload
            if isinstance(item, dict)
        ]

    @staticmethod
    def _build_summary(stage: Stage, extracted_fields: dict[str, object]) -> str:
        if extracted_fields:
            field_names = ", ".join(sorted(extracted_fields))
            return f"{stage.label} currently covers: {field_names}."
        return f"{stage.label} still needs structured clarification."

    @staticmethod
    def _backlog_fields(stage: Stage, fields: dict[str, Any]) -> dict[str, Any]:
        """Convert explicit fake backlog strings into identified entries.

        Args:
            stage (Stage): Active stage.
            fields (dict[str, Any]): Parsed fixture fields.

        Returns:
            dict[str, Any]: Fields matching the backlog contract.
        """
        if stage is Stage.STAGE_6_BACKLOG_SYNTHESIS:
            return {
                key: [{"statement": value} if isinstance(value, str) else value for value in values]
                for key, values in fields.items()
            }
        return fields

    @staticmethod
    async def reply(*, stage: Stage, analysis: AssistantAnalysis, user_message: str) -> str:
        """Return the scripted conversational reply.

        Args:
            stage (Stage): Processed stage.
            analysis (AssistantAnalysis): Validated accumulated state.
            user_message (str): Latest user text.

        Returns:
            str: Deterministic reply.
        """
        del stage, user_message
        return analysis.assistant_message


@dataclass
class OpenAICompatibleBrainstormLLM:
    """Async structured extraction, optional findings and streamable reply."""

    client: AsyncOpenAI
    settings: Settings
    prompt_loader: PromptLoader

    @staticmethod
    def _invalid_response(message: str) -> None:
        raise ValueError(message)

    @staticmethod
    def _stage_error() -> str:
        return "The analysis stage must match the active stage"

    @staticmethod
    def _truncated_error() -> str:
        return "Response truncated or refused"

    @classmethod
    def _parse_structured_response(
        cls,
        model: type[BaseModel],
        content: str,
        stage: Stage,
        finish_reason: str,
    ) -> BaseModel:
        """Validate provider content and server-selected stage.

        Args:
            model (type[BaseModel]): Output contract.
            content (str): Provider JSON.
            stage (Stage): Expected stage.
            finish_reason (str): Provider completion status.

        Returns:
            BaseModel: Validated structured output.
        """
        if finish_reason not in {"stop", "tool_calls"}:
            cls._invalid_response(cls._truncated_error())
        parsed = model.model_validate_json(content)
        if isinstance(parsed, AssistantAnalysis) and parsed.stage is not stage:
            cls._invalid_response(cls._stage_error())
        return parsed

    async def _structured(
        self,
        *,
        stage: Stage,
        model: type[BaseModel],
        prompt: str,
        usage: AssistantAnalysis | None = None,
    ) -> BaseModel:
        """Request structured output with one bounded validation repair.

        Args:
            stage (Stage): Active stage.
            model (type[BaseModel]): Output contract.
            prompt (str): Task and context.
            usage (AssistantAnalysis | None): Mutable usage accumulator.

        Returns:
            BaseModel: Validated provider output.

        Raises:
            LLMResponseError: If output is still invalid after repair.
            AssertionError: If the bounded retry loop terminates unexpectedly.
        """
        messages: list[ChatCompletionMessageParam] = [
            {"role": "system", "content": self.prompt_loader.system_prompt()},
            {"role": "user", "content": prompt},
        ]
        schema = pydantic_function_tool(model)["function"]["parameters"]
        _strip_gate_metadata(schema)
        options: Any
        if self.settings.llm_output_mode is StructuredOutputMode.TOOL:
            options = {
                "tools": [
                    {
                        "type": "function",
                        "function": {"name": "submit_analysis", "strict": True, "parameters": schema},
                    },
                ],
                "tool_choice": {"type": "function", "function": {"name": "submit_analysis"}},
            }
        elif self.settings.llm_output_mode is StructuredOutputMode.JSON_OBJECT:
            options = {"response_format": {"type": "json_object"}}
        else:
            options = {
                "response_format": {
                    "type": "json_schema",
                    "json_schema": {"name": model.__name__, "strict": True, "schema": schema},
                },
            }
        for attempt in range(2):
            async with asyncio.timeout(self.settings.openai_timeout_seconds):
                completion = await self.client.chat.completions.create(
                    model=self.settings.model_name,
                    messages=messages,
                    max_tokens=self.settings.llm_max_tokens,
                    **cast("Any", options),
                )
            if usage is not None and completion.usage:
                usage.prompt_tokens += completion.usage.prompt_tokens
                usage.completion_tokens += completion.usage.completion_tokens
            message = completion.choices[0].message
            content = message.content or ""
            if self.settings.llm_output_mode is StructuredOutputMode.TOOL and message.tool_calls:
                content = cast("Any", message.tool_calls[0]).function.arguments
            try:
                parsed = self._parse_structured_response(
                    model,
                    content,
                    stage,
                    completion.choices[0].finish_reason,
                )
            except (ValueError, ValidationError) as exc:
                if attempt:
                    raise LLMResponseError(
                        stage=stage.value,
                        message="Invalid structured output after one retry. Check LLM_OUTPUT_MODE and model schema support; retry the turn.",
                        raw_output_excerpt="",
                    ) from exc
                messages.append({
                    "role": "user",
                    "content": f"Validation error: {exc}. Return a corrected JSON object using this schema: {json.dumps(schema)}",
                })
            else:
                return parsed
        raise AssertionError

    async def analyze(
        self,
        *,
        stage: Stage,
        user_message: str,
        session_state: BrainstormSessionState,
        current_stage_state: StageState | None,
    ) -> AssistantAnalysis:
        """Extract a bounded typed patch from conversation context.

        Args:
            stage (Stage): Active stage.
            user_message (str): Latest user message.
            session_state (BrainstormSessionState): Session snapshot.
            current_stage_state (StageState | None): Accumulated active state.

        Returns:
            AssistantAnalysis: Validated patch and actual usage.
        """
        model = create_model(
            f"{STAGE_MODELS[stage].__name__}Analysis",
            __base__=AssistantAnalysis,
            stage=(Stage, stage),
            extracted_fields=(STAGE_MODELS[stage], ...),
        )
        current = (
            current_stage_state.model_dump(mode="json", exclude={"latest_markdown"})
            if current_stage_state
            else {}
        )
        context = {
            "current": current,
            "coverage": validate_stage(
                stage=stage,
                extracted_fields=current.get("extracted_fields", {}),
                open_questions=[],
                partial_fields=current.get("partial_fields", {}),
            ).model_dump(mode="json")["coverage"],
            "reference_catalog": reference_catalog({
                key: value.extracted_fields.model_dump(exclude_none=True)
                for key, value in session_state.stage_states.items()
                if key != stage.value
            }),
            "previous_fields": {
                key: value.extracted_fields.model_dump(exclude_none=True)
                for key, value in session_state.stage_states.items()
                if key != stage.value
            },
            "transcript": session_state.transcript[-self.settings.llm_context_turns :]
            if self.settings.llm_context_turns
            else [],
            "previous_stages": {
                key: value.summary for key, value in session_state.stage_states.items() if key != stage.value
            },
        }
        prompt = "\n\n".join([
            self.prompt_loader.stage_prompt(stage),
            self.prompt_loader.completeness_prompt(),
            json.dumps(model.model_json_schema()),
            json.dumps(context),
            user_message,
        ])
        usage = AssistantAnalysis(stage=stage, summary="", assistant_message="")
        # The selected stage is supplied by the server, never inferred from model text.
        result = await self._structured(stage=stage, model=model, prompt=prompt, usage=usage)
        analysis = AssistantAnalysis.model_validate({**result.model_dump(), "stage": stage})
        analysis.prompt_tokens = usage.prompt_tokens
        analysis.completion_tokens = usage.completion_tokens
        return analysis

    async def challenge(self, *, stage: Stage, analysis: AssistantAnalysis) -> AssistantAnalysis:
        """Append optional findings; preserve the extracted business state.

        Args:
            stage (Stage): Active stage.
            analysis (AssistantAnalysis): Accumulated analysis.

        Returns:
            AssistantAnalysis: Analysis with findings only.
        """
        if self.settings.llm_challenge_pass is ChallengePass.FINDINGS:
            result = await self._structured(
                stage=stage,
                model=Findings,
                prompt=self.prompt_loader.contradiction_prompt() + analysis.model_dump_json(),
                usage=analysis,
            )
            analysis.contradictions.extend(Findings.model_validate(result).findings)
        return analysis

    async def stream_reply(
        self,
        *,
        stage: Stage,
        analysis: AssistantAnalysis,
        user_message: str,
    ) -> AsyncIterator[str]:
        """Stream reply deltas and account for provider usage.

        Args:
            stage (Stage): Active stage.
            analysis (AssistantAnalysis): Validated accumulated analysis.
            user_message (str): Language and conversational context.

        Yields:
            str: Provider text delta.
        """
        del stage
        async with asyncio.timeout(self.settings.openai_timeout_seconds):
            stream = await self.client.chat.completions.create(
                model=self.settings.model_name,
                max_tokens=self.settings.llm_max_tokens,
                stream=True,
                stream_options={"include_usage": True},
                messages=[
                    {
                        "role": "system",
                        "content": self.prompt_loader.system_prompt()
                        + " Respond conversationally in the user's language. Ask only the supplied selected questions (at most three), preserve their priority, reasons and options; do not invent answers or claim an unapproved transition.",
                    },
                    {"role": "user", "content": user_message + "\n" + analysis.model_dump_json()},
                ],
            )
            async for chunk in stream:
                if chunk.usage:
                    analysis.prompt_tokens += chunk.usage.prompt_tokens
                    analysis.completion_tokens += chunk.usage.completion_tokens
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content

    async def reply(self, *, stage: Stage, analysis: AssistantAnalysis, user_message: str) -> str:
        """Collect the stream for transports without incremental events.

        Args:
            stage (Stage): Active stage.
            analysis (AssistantAnalysis): Validated analysis.
            user_message (str): Latest user text.

        Returns:
            str: Conversational response.
        """
        return "".join([
            part
            async for part in self.stream_reply(stage=stage, analysis=analysis, user_message=user_message)
        ])


class Findings(BaseModel):
    """Challenge output cannot replace extracted fields."""

    model_config = ConfigDict(extra="forbid")
    findings: list[str]


def build_llm(*, settings: Settings, prompt_loader: PromptLoader) -> BrainstormLLM:
    """Build an async adapter.

    Args:
        settings (Settings): Runtime settings.
        prompt_loader (PromptLoader): Versioned prompt loader.

    Returns:
        BrainstormLLM: Configured adapter.
    """
    if settings.llm_mode is LLMMode.FAKE:
        return FakeBrainstormLLM(prompt_loader=prompt_loader)
    settings.validate_provider_configuration()
    return OpenAICompatibleBrainstormLLM(
        client=AsyncOpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
            timeout=settings.openai_timeout_seconds,
            max_retries=0,
        ),
        settings=settings,
        prompt_loader=prompt_loader,
    )
