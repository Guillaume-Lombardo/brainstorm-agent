"""LangGraph node implementations."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING
from uuid import uuid4

from brainstorm_agent.core.elicitation import filter_defaults, selected_questions
from brainstorm_agent.core.enums import Stage
from brainstorm_agent.core.gate_questions import GATE_ID_PREFIX, gate_questions
from brainstorm_agent.core.language import session_language
from brainstorm_agent.core.models import (
    AssistantAnalysis,
    AssistantTurnOutput,
    BrainstormSessionState,
    Clarification,
    PartialField,
    StageState,
    StageValidationResult,
)
from brainstorm_agent.core.validation import validate_stage
from brainstorm_agent.services.llm_client import StreamingReply

if TYPE_CHECKING:
    from brainstorm_agent.graph.state import TurnGraphState
    from brainstorm_agent.services.llm_client import BrainstormLLM
    from brainstorm_agent.services.markdown import MarkdownRenderer


type TurnNode = Callable[[TurnGraphState], Awaitable[dict[str, object]]]


def make_extract_node(llm: BrainstormLLM) -> TurnNode:
    """Create the extract node closure.

    Args:
        llm: Structured LLM adapter.

    Returns:
        TurnNode: Graph node that builds structured analysis.
    """

    async def extract_structured_state(state: TurnGraphState) -> dict[str, object]:
        session_state = BrainstormSessionState.model_validate(state["session_state"])
        stage = Stage(state["current_stage"])
        current_stage_state = session_state.stage_states.get(stage.value)
        analysis = await llm.analyze(
            stage=stage,
            user_message=state["user_message"],
            session_state=session_state,
            current_stage_state=StageState.model_validate(current_stage_state)
            if current_stage_state
            else None,
        )
        if current_stage_state:
            analysis.clarifications = [
                Clarification(question_id=q.id, question=q.question, answer=state["user_message"])
                for q in current_stage_state.open_questions
                if q.id in analysis.resolved_question_ids
            ]
        filter_defaults(analysis)
        analysis = merge_analysis(previous=current_stage_state, patch=analysis)
        return {"analysis": analysis.model_dump(mode="json")}

    return extract_structured_state


def make_challenge_node(llm: BrainstormLLM) -> TurnNode:
    """Create the contradiction challenge node closure.

    Args:
        llm: Structured LLM adapter.

    Returns:
        TurnNode: Graph node that challenges ambiguity and contradictions.
    """

    async def challenge_contradictions(state: TurnGraphState) -> dict[str, object]:
        stage = Stage(state["current_stage"])
        analysis = AssistantAnalysis.model_validate(state["analysis"])
        challenged = await llm.challenge(stage=stage, analysis=analysis)
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
    analysis.open_questions = [q for q in analysis.open_questions if not q.id.startswith(GATE_ID_PREFIX)]
    partial_fields = {item.field: item.reason for item in analysis.partial_fields}
    session_state = state["session_state"]
    validation = validate_stage(
        stage=stage,
        extracted_fields=analysis.extracted_fields.model_dump(exclude_none=True),
        open_questions=analysis.open_questions,
        partial_fields=partial_fields,
        contradictions=analysis.contradictions,
        previous_fields={
            key: item["extracted_fields"]
            for key, item in session_state.get("stage_states", {}).items()
            if key != stage.value
        },
    )
    analysis.open_questions.extend(
        gate_questions(
            validation,
            language=session_language(state["user_message"], session_state.get("transcript", [])),
            partial_fields=partial_fields,
            contradictions=analysis.contradictions,
            model_questions=analysis.open_questions,
        ),
    )
    analysis.stage_is_clear_enough = validation.stage_is_clear_enough
    analysis.transition_decision_reason = validation.transition_decision_reason
    return {
        "analysis": analysis.model_dump(mode="json"),
        "validation": validation.model_dump(mode="json"),
    }


def make_render_node(renderer: MarkdownRenderer, llm: BrainstormLLM) -> TurnNode:
    """Create the Markdown rendering node closure.

    Args:
        renderer (MarkdownRenderer): Markdown renderer.
        llm (BrainstormLLM): Conversational reply adapter.

    Returns:
        TurnNode: Graph node that renders Markdown.
    """

    async def render_step_markdown(state: TurnGraphState) -> dict[str, object]:
        analysis = AssistantAnalysis.model_validate(state["analysis"])
        validation = StageValidationResult.model_validate(state["validation"])
        stage = Stage(state["current_stage"])
        reply_analysis = analysis.model_copy(
            update={"open_questions": selected_questions(analysis.open_questions)},
        )
        callback = state.get("on_delta")
        if callback is not None and isinstance(llm, StreamingReply):
            parts = []
            async for part in llm.stream_reply(
                stage=stage,
                analysis=reply_analysis,
                user_message=state["user_message"],
            ):
                parts.append(part)
                await callback(part)
            analysis.assistant_message = "".join(parts)
        else:
            analysis.assistant_message = await llm.reply(
                stage=stage,
                analysis=reply_analysis,
                user_message=state["user_message"],
            )
            if callback is not None:
                for part in analysis.assistant_message.splitlines(keepends=True):
                    await callback(part)

        markdown = renderer.render(
            stage=stage,
            analysis=analysis,
            validation=validation,
        )
        return {"markdown": markdown, "analysis": analysis.model_dump(mode="json")}

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
        prompt_tokens=analysis.prompt_tokens,
        completion_tokens=analysis.completion_tokens,
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
        open_questions=selected_questions(analysis.open_questions),
        coverage=state["validation"]["coverage"],
        readiness=state["validation"]["readiness"],
        risks=analysis.risks,
        step_markdown=state["markdown"],
        transition_decision_reason=analysis.transition_decision_reason,
        next_stage=next_stage,
    )
    return {"assistant_output": output.model_dump(mode="json")}


def merge_analysis(*, previous: StageState | None, patch: AssistantAnalysis) -> AssistantAnalysis:
    """Merge non-null field updates and stable item ids before gate validation.

    Args:
        previous (StageState | None): Persisted accumulated state.
        patch (AssistantAnalysis): Typed provider update.

    Returns:
        AssistantAnalysis: Merged state; question resolutions are explicit.
    """
    known_ids = {item.id for item in previous.open_questions} if previous else set()
    patch.open_questions = [
        item if item.id in known_ids else item.model_copy(update={"id": str(uuid4())})
        for item in {item.id: item for item in patch.open_questions}.values()
    ]
    if previous is None:
        return patch
    patch.clarifications = [*previous.clarifications, *patch.clarifications]
    partial_fields = {
        **{
            key: reason
            for key, reason in previous.partial_fields.items()
            if patch.extracted_fields.get(key) is None
        },
        **{item.field: item.reason for item in patch.partial_fields},
    }
    patch.partial_fields = [PartialField(field=key, reason=value) for key, value in partial_fields.items()]
    fields = previous.extracted_fields.model_dump(exclude_none=True)
    updates = patch.extracted_fields.model_dump(exclude_none=True)
    for name, value in updates.items():
        if name in {"risks_by_category", "mvp_user_stories", "risk_spikes", "cross_cutting_work"}:
            items = {item["id"]: item for item in fields.get(name, [])}
            items.update({item["id"]: item for item in value})
            fields[name] = list(items.values())
        else:
            fields[name] = value
    for name in ("risks_by_category", "mvp_user_stories", "risk_spikes", "cross_cutting_work"):
        if name in fields:
            fields[name] = [item for item in fields[name] if item["id"] not in patch.resolved_item_ids]
    patch.extracted_fields = type(patch.extracted_fields).model_validate(fields)
    for collection in ("facts", "assumptions", "decisions", "risks", "open_questions"):
        items = {item.id: item for item in getattr(previous, collection)}
        for item in getattr(patch, collection):
            items[item.id] = item
        if collection == "open_questions":
            items = {key: item for key, item in items.items() if key not in patch.resolved_question_ids}
        items = {key: item for key, item in items.items() if key not in patch.resolved_item_ids}
        setattr(patch, collection, list(items.values()))
    return patch
