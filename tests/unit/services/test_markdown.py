from __future__ import annotations

from brainstorm_agent.core.enums import Stage
from brainstorm_agent.core.models import AssistantAnalysis, FactItem, OpenQuestionItem, StageValidationResult
from brainstorm_agent.services.markdown import MarkdownRenderer
from brainstorm_agent.services.prompt_loader import PromptLoader


def test_markdown_renderer_emits_required_sections() -> None:
    loader = PromptLoader()
    renderer = MarkdownRenderer(loader)

    markdown = renderer.render(
        stage=Stage.STAGE_0_PITCH,
        analysis=AssistantAnalysis(
            summary="Pitch clarified.",
            assistant_message="Please confirm the user segment.",
            facts=[FactItem(statement="The project targets B2B teams.")],
            uncertainties=["ICP remains broad."],
            open_questions=[OpenQuestionItem(question="Who buys the product?", blocking=True)],
        ),
        validation=StageValidationResult(
            stage=Stage.STAGE_0_PITCH,
            stage_is_clear_enough=False,
            transition_decision_reason="Target users remain unclear.",
        ),
    )

    assert "# Structured Summary" in markdown
    assert "# Open Questions and Uncertainties" in markdown
    assert "# Questions to Continue" in markdown
    assert "# Stage Deliverable" in markdown
    assert "### Facts" in markdown
    assert "### Assumptions" in markdown
    assert "### Decisions" in markdown
    assert "### Risks" in markdown
    assert "### Open Questions" in markdown
