"""Markdown rendering for stage documents."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from brainstorm_agent.core.enums import Stage
    from brainstorm_agent.core.models import AssistantAnalysis, StageValidationResult
    from brainstorm_agent.services.prompt_loader import PromptLoader


class MarkdownRenderer:
    """Render deterministic Markdown artifacts."""

    def __init__(self, prompt_loader: PromptLoader) -> None:
        """Initialize the renderer.

        Args:
            prompt_loader: Prompt loader used to assert prompt availability.
        """
        self.prompt_loader = prompt_loader

    @staticmethod
    def _bullet_lines(items: list[str], *, empty_message: str) -> list[str]:
        if not items:
            return [f"- {empty_message}"]
        return [f"- {item}" for item in items]

    @staticmethod
    def _fact_lines(analysis: AssistantAnalysis) -> list[str]:
        if not analysis.facts:
            return ["- None explicitly confirmed yet."]
        return [f"- {item.statement}" for item in analysis.facts]

    @staticmethod
    def _assumption_lines(analysis: AssistantAnalysis) -> list[str]:
        if not analysis.assumptions:
            return ["- None explicitly recorded."]
        return [f"- {item.statement}" for item in analysis.assumptions]

    @staticmethod
    def _decision_lines(analysis: AssistantAnalysis) -> list[str]:
        if not analysis.decisions:
            return ["- None taken yet."]
        return [
            f"- {item.statement}{f' ({item.rationale})' if item.rationale else ''}"
            for item in analysis.decisions
        ]

    @staticmethod
    def _risk_lines(analysis: AssistantAnalysis) -> list[str]:
        if not analysis.risks:
            return ["- No explicit risks recorded yet."]
        return [
            (
                f"- [{item.category}] {item.description} | impact: {item.impact} | "
                f"probability: {item.probability} | mitigation: {item.mitigation} | action: {item.action}"
            )
            for item in analysis.risks
        ]

    @staticmethod
    def _open_question_lines(analysis: AssistantAnalysis, *, with_details: bool) -> list[str]:
        if not analysis.open_questions:
            return ["- None."]
        if with_details:
            return [
                (
                    f"- {item.question}"
                    f"{' (blocking)' if item.blocking else ''}"
                    f"{f': {item.why_it_matters}' if item.why_it_matters else ''}"
                )
                for item in analysis.open_questions
            ]
        return [f"- {item.question}" for item in analysis.open_questions]

    def render(
        self,
        *,
        stage: Stage,
        analysis: AssistantAnalysis,
        validation: StageValidationResult,
    ) -> str:
        """Render a Markdown document for one assistant turn.

        Args:
            stage: Processed stage.
            analysis: Structured assistant analysis.
            validation: Rule-based validation outcome.

        Returns:
            str: Rendered Markdown.
        """
        self.prompt_loader.markdown_prompt()
        lines = [
            "# Structured Summary",
            "",
            f"## {stage.label}",
            "",
            analysis.summary,
            "",
            "# Open Questions and Uncertainties",
            "",
            *self._bullet_lines(analysis.uncertainties, empty_message="None currently identified."),
            "",
            "## Open Questions",
            "",
            *self._open_question_lines(analysis, with_details=True),
            "",
            "# Questions to Continue",
            "",
            *self._bullet_lines(
                [item.question for item in analysis.open_questions],
                empty_message="No further question required to complete this stage.",
            ),
            "",
            "# Stage Deliverable",
            "",
            f"## {stage.label}",
            "",
            "### Facts",
            "",
            *self._fact_lines(analysis),
            "",
            "### Assumptions",
            "",
            *self._assumption_lines(analysis),
            "",
            "### Decisions",
            "",
            *self._decision_lines(analysis),
            "",
            "### Risks",
            "",
            *self._risk_lines(analysis),
            "",
            "### Open Questions",
            "",
            *self._open_question_lines(analysis, with_details=False),
            "",
            "### Transition Decision",
            "",
            f"- Stage clear enough: {'yes' if validation.stage_is_clear_enough else 'no'}",
            f"- Reason: {validation.transition_decision_reason}",
        ]
        return "\n".join(lines)
