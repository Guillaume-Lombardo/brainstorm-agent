"""LangGraph builder for one conversation turn."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast

from langgraph.graph import END, START, StateGraph

from brainstorm_agent.graph.nodes import (
    apply_stage_rules,
    decide_transition,
    make_challenge_node,
    make_extract_node,
    make_render_node,
)
from brainstorm_agent.graph.state import TurnGraphState

if TYPE_CHECKING:
    from langgraph.graph.state import CompiledStateGraph

    from brainstorm_agent.services.llm_client import BrainstormLLM
    from brainstorm_agent.services.markdown import MarkdownRenderer


def build_turn_graph(
    *,
    llm: BrainstormLLM,
    renderer: MarkdownRenderer,
) -> CompiledStateGraph:
    """Build the LangGraph used to process one turn.

    Args:
        llm: Structured LLM adapter.
        renderer: Markdown renderer.

    Returns:
        CompiledStateGraph: Compiled LangGraph runtime.
    """
    graph = cast("Any", StateGraph)(TurnGraphState)
    graph.add_node("extract_structured_state", cast("Any", make_extract_node(llm)))
    graph.add_node("challenge_contradictions", cast("Any", make_challenge_node(llm)))
    graph.add_node("apply_stage_rules", apply_stage_rules)
    graph.add_node("render_step_markdown", cast("Any", make_render_node(renderer)))
    graph.add_node("decide_transition", decide_transition)

    graph.add_edge(START, "extract_structured_state")
    graph.add_edge("extract_structured_state", "challenge_contradictions")
    graph.add_edge("challenge_contradictions", "apply_stage_rules")
    graph.add_edge("apply_stage_rules", "render_step_markdown")
    graph.add_edge("render_step_markdown", "decide_transition")
    graph.add_edge("decide_transition", END)
    return graph.compile()
