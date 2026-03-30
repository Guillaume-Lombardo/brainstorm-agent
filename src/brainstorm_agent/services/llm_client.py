"""LLM adapters for stage analysis."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Protocol, cast

from openai import OpenAI

from brainstorm_agent.core.enums import LLMMode, Stage
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
from brainstorm_agent.core.stage_contracts import STAGE_CONTRACTS, STAGE_FIELD_ALIASES

if TYPE_CHECKING:
    from collections.abc import Iterable

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


def _extract_json_object(content: str) -> dict[str, Any]:
    """Extract the first JSON object from model output.

    Args:
        content: Raw model output.

    Returns:
        dict[str, Any]: Parsed JSON object.

    Raises:
        ValueError: If no JSON object can be found.
    """
    start = content.find("{")
    end = content.rfind("}")
    if start == -1 or end == -1 or start >= end:
        raise ValueError
    return json.loads(content[start : end + 1])


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


class BrainstormLLM(Protocol):
    """Protocol for structured brainstorming analysis."""

    def analyze(
        self,
        *,
        stage: Stage,
        user_message: str,
        session_state: BrainstormSessionState,
        current_stage_state: StageState | None,
    ) -> AssistantAnalysis:
        """Produce a structured stage analysis."""

    def challenge(
        self,
        *,
        stage: Stage,
        analysis: AssistantAnalysis,
    ) -> AssistantAnalysis:
        """Refine the analysis with contradiction checks."""


@dataclass
class HeuristicBrainstormLLM:
    """Deterministic fallback implementation for tests and local runs."""

    prompt_loader: PromptLoader

    def analyze(
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
        del session_state
        del current_stage_state
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

        if stage is Stage.STAGE_0_PITCH and "pitch_summary" not in extracted_fields:
            extracted_fields["pitch_summary"] = user_message.strip()
            extracted_fields["clear_points"] = [user_message.strip()] if user_message.strip() else []
            extracted_fields["ambiguities"] = ["Target users are not fully specified."]
            extracted_fields["missing_information"] = ["Expected outcomes are not explicit."]

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
            "The heuristic analysis found no missing blocking field."
            if stage_is_clear_enough
            else "The heuristic analysis still needs mandatory clarifications."
        )
        assistant_message = (
            "Please answer the blocking questions so we can continue this stage."
            if open_questions
            else f"{stage.label} is clear enough. We can move to the next stage."
        )
        return AssistantAnalysis(
            summary=self._build_summary(stage, extracted_fields),
            assistant_message=assistant_message,
            facts=facts,
            assumptions=assumptions,
            decisions=decisions,
            uncertainties=uncertainties,
            open_questions=open_questions,
            risks=risks,
            extracted_fields=extracted_fields,
            stage_is_clear_enough=stage_is_clear_enough,
            transition_decision_reason=reason,
        )

    def challenge(
        self,
        *,
        stage: Stage,
        analysis: AssistantAnalysis,
    ) -> AssistantAnalysis:
        """Refine heuristic analysis with contradiction signals.

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


@dataclass
class OpenAICompatibleBrainstormLLM:
    """OpenAI-compatible implementation using chat completions."""

    client: OpenAI
    settings: Settings
    prompt_loader: PromptLoader

    def analyze(
        self,
        *,
        stage: Stage,
        user_message: str,
        session_state: BrainstormSessionState,
        current_stage_state: StageState | None,
    ) -> AssistantAnalysis:
        """Produce a structured analysis with an OpenAI-compatible model.

        Args:
            stage: Active stage.
            user_message: Latest user message.
            session_state: Current session state.
            current_stage_state: Current stage state snapshot.

        Returns:
            AssistantAnalysis: Parsed model output.
        """
        prompt = "\n\n".join(
            [
                self.prompt_loader.system_prompt(),
                self.prompt_loader.stage_prompt(stage),
                self.prompt_loader.completeness_prompt(),
                (
                    "Return one JSON object with keys: summary, assistant_message, facts, assumptions, "
                    "decisions, uncertainties, open_questions, risks, extracted_fields, "
                    "stage_is_clear_enough, transition_decision_reason."
                ),
                f"Current stage: {stage.value}",
                f"Current session state JSON: {session_state.model_dump_json()}",
                f"Current stage state JSON: {current_stage_state.model_dump_json() if current_stage_state else '{}'}",
                f"Latest user message:\n{user_message}",
            ],
        )
        completion = self.client.chat.completions.create(
            model=self.settings.model_name,
            temperature=0.1,
            messages=[
                {
                    "role": "system",
                    "content": "You are a strict structured analysis backend. Return JSON only.",
                },
                {"role": "user", "content": prompt},
            ],
        )
        content = completion.choices[0].message.content or "{}"
        payload = _extract_json_object(content)
        return AssistantAnalysis.model_validate(payload)

    def challenge(
        self,
        *,
        stage: Stage,
        analysis: AssistantAnalysis,
    ) -> AssistantAnalysis:
        """Challenge an analysis for ambiguity or contradictions.

        Args:
            stage: Active stage.
            analysis: Current analysis payload.

        Returns:
            AssistantAnalysis: Updated analysis payload.
        """
        prompt = "\n\n".join(
            [
                self.prompt_loader.system_prompt(),
                self.prompt_loader.contradiction_prompt(),
                f"Current stage: {stage.value}",
                f"Analysis JSON: {analysis.model_dump_json()}",
                "Return the full updated JSON object only.",
            ],
        )
        completion = self.client.chat.completions.create(
            model=self.settings.model_name,
            temperature=0.1,
            messages=[
                {
                    "role": "system",
                    "content": "You are a strict structured analysis backend. Return JSON only.",
                },
                {"role": "user", "content": prompt},
            ],
        )
        content = completion.choices[0].message.content or "{}"
        payload = _extract_json_object(content)
        return AssistantAnalysis.model_validate(payload)


def build_llm(*, settings: Settings, prompt_loader: PromptLoader) -> BrainstormLLM:
    """Build the configured LLM adapter.

    Args:
        settings: Application settings.
        prompt_loader: Prompt loader instance.

    Returns:
        BrainstormLLM: Configured LLM adapter.
    """
    if settings.llm_mode == LLMMode.OPENAI:
        client = OpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
            timeout=settings.openai_timeout_seconds,
        )
        return OpenAICompatibleBrainstormLLM(client=client, settings=settings, prompt_loader=prompt_loader)
    return HeuristicBrainstormLLM(prompt_loader=prompt_loader)
