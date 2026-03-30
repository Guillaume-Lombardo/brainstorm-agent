"""LangGraph node implementations."""

from __future__ import annotations

from collections.abc import Callable
from typing import TYPE_CHECKING

from brainstorm_agent.core.enums import Stage
from brainstorm_agent.core.models import (
    AssistantAnalysis,
    AssistantTurnOutput,
    BrainstormSessionState,
    StageState,
    StageValidationResult,
)
from brainstorm_agent.core.validation import validate_stage

if TYPE_CHECKING:
    from brainstorm_agent.graph.state import TurnGraphState
    from brainstorm_agent.services.llm_client import BrainstormLLM
    from brainstorm_agent.services.markdown import MarkdownRenderer


type TurnNode = Callable[[TurnGraphState], dict[str, object]]


def make_extract_node(llm: BrainstormLLM) -> TurnNode:
    """Create the extract node closure.

    Args:
        llm: Structured LLM adapter.

    Returns:
        TurnNode: Graph node that builds structured analysis.
    """

    def extract_structured_state(state: TurnGraphState) -> dict[str, object]:
        session_state = BrainstormSessionState.model_validate(state["session_state"])
        stage = Stage(state["current_stage"])
        current_stage_state = session_state.stage_states.get(stage.value)
        analysis = llm.analyze(
            stage=stage,
            user_message=state["user_message"],
            session_state=session_state,
            current_stage_state=StageState.model_validate(current_stage_state)
            if current_stage_state
            else None,
        )
        return {"analysis": analysis.model_dump(mode="json")}

    return extract_structured_state


def make_challenge_node(llm: BrainstormLLM) -> TurnNode:
    """Create the contradiction challenge node closure.

    Args:
        llm: Structured LLM adapter.

    Returns:
        TurnNode: Graph node that challenges ambiguity and contradictions.
    """

    def challenge_contradictions(state: TurnGraphState) -> dict[str, object]:
        stage = Stage(state["current_stage"])
        analysis = AssistantAnalysis.model_validate(state["analysis"])
        challenged = llm.challenge(stage=stage, analysis=analysis)
        return {"analysis": challenged.model_dump(mode="json")}

    return challenge_contradictions


def apply_stage_rules(state: TurnGraphState) -> dict[str, object]:
    """Apply deterministic stage validation rules.

    Args:
        state: Current graph state.

    Returns:
        dict[str, object]: Validation payload update.
    """
    stage = Stage(state["current_stage"])
    analysis = AssistantAnalysis.model_validate(state["analysis"])
    validation = validate_stage(
        stage=stage,
        extracted_fields=analysis.extracted_fields,
        open_questions=analysis.open_questions,
    )
    analysis.stage_is_clear_enough = analysis.stage_is_clear_enough and validation.stage_is_clear_enough
    analysis.transition_decision_reason = validation.transition_decision_reason
    return {
        "analysis": analysis.model_dump(mode="json"),
        "validation": validation.model_dump(mode="json"),
    }


def make_render_node(renderer: MarkdownRenderer) -> TurnNode:
    """Create the Markdown rendering node closure.

    Args:
        renderer: Markdown renderer.

    Returns:
        TurnNode: Graph node that renders Markdown.
    """

    def render_step_markdown(state: TurnGraphState) -> dict[str, object]:
        analysis = AssistantAnalysis.model_validate(state["analysis"])
        validation = StageValidationResult.model_validate(state["validation"])
        stage = Stage(state["current_stage"])
        markdown = renderer.render(
            stage=stage,
            analysis=analysis,
            validation=validation,
        )
        return {"markdown": markdown}

    return render_step_markdown


def decide_transition(state: TurnGraphState) -> dict[str, object]:
    """Build the final assistant output for the processed turn.

    Args:
        state: Current graph state.

    Returns:
        dict[str, object]: Assistant output payload.
    """
    stage = Stage(state["current_stage"])
    analysis = AssistantAnalysis.model_validate(state["analysis"])
    next_stage = stage.next_stage() if analysis.stage_is_clear_enough else None
    current_stage = next_stage or stage
    output = AssistantTurnOutput(
        session_id=state["session_id"],
        current_stage=current_stage,
        processed_stage=stage,
        stage_clear_enough=analysis.stage_is_clear_enough,
        assistant_message=analysis.assistant_message,
        summary=analysis.summary,
        facts=analysis.facts,
        assumptions=analysis.assumptions,
        decisions=analysis.decisions,
        uncertainties=analysis.uncertainties,
        open_questions=analysis.open_questions,
        risks=analysis.risks,
        step_markdown=state["markdown"],
        transition_decision_reason=analysis.transition_decision_reason,
        next_stage=next_stage,
    )
    return {"assistant_output": output.model_dump(mode="json")}
