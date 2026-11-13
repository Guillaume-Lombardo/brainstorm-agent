"""Application service for session lifecycle and conversation turns."""

from __future__ import annotations

import asyncio
import difflib
from collections.abc import AsyncIterator, Awaitable, Callable  # noqa: TC003
from contextlib import suppress
from typing import TYPE_CHECKING, Any
from uuid import uuid4

from pydantic import ValidationError
from sqlalchemy import select

from brainstorm_agent.async_runner import run_async
from brainstorm_agent.core.application import (
    AnalysisStatus,
    BacklogExport,
    CommentInput,
    CoverageUpdated,
    DocumentDiff,
    DocumentUpdated,
    MessageDelta,
    ReviewAction,
    ReviewInput,
    ReviewRequired,
    SessionPage,
    SessionPatch,
    SliceSpecsExport,
    StageChanged,
    StagePatch,
    TurnCompleted,
    TurnError,
    TurnEvent,
    TurnStarted,
)
from brainstorm_agent.core.enums import HumanReviewDecision, MessageRole, Modality, Stage
from brainstorm_agent.core.models import (
    AssistantAnalysis,
    AssistantTurnOutput,
    BrainstormSessionState,
    ConversationTurn,
    HumanReviewRecord,
    PendingHumanReview,
    SectionComment,
    SessionOverview,
    StageState,
    StageValidationResult,
    StepDocument,
)
from brainstorm_agent.exceptions import ConflictError, NotFoundError
from brainstorm_agent.graph.builder import build_turn_graph
from brainstorm_agent.graph.nodes import apply_stage_rules
from brainstorm_agent.persistence.models import BOOTSTRAP_USER_ID, SessionRecord
from brainstorm_agent.persistence.repositories import (
    DocumentRepository,
    HumanReviewRepository,
    MessageRepository,
    OpenQuestionRepository,
    SessionRepository,
    TransitionRepository,
)
from brainstorm_agent.services.llm_client import BrainstormLLM, OpenAICompatibleBrainstormLLM, build_llm
from brainstorm_agent.services.locks import NoopSessionLockManager, SessionLockManager
from brainstorm_agent.services.markdown import MarkdownRenderer
from brainstorm_agent.services.prompt_loader import PromptLoader
from brainstorm_agent.services.users import UserService

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from brainstorm_agent.settings import Settings


class SessionService:  # noqa: PLR0904 - Shared owner authorization boundary
    """Orchestrate session creation and message processing."""

    @staticmethod
    def _default_prompt_loader(settings: Settings) -> PromptLoader:
        """Build the default prompt loader from settings.

        Args:
            settings: Application settings.

        Returns:
            PromptLoader: Prompt loader configured for packaged resources.
        """
        return PromptLoader.from_settings(settings)

    def __init__(  # noqa: PLR0913 - Explicit application dependencies
        self,
        *,
        db_session: Session,
        settings: Settings,
        owner_id: str | None = None,
        llm: BrainstormLLM | None = None,
        prompt_loader: PromptLoader | None = None,
        lock_manager: SessionLockManager | None = None,
    ) -> None:
        """Initialize the session service.

        Args:
            db_session: Database session.
            settings: Application settings.
            owner_id: Authenticated owner; required when authentication is enabled.
            llm: Optional structured LLM adapter override.
            prompt_loader: Optional prompt loader override.
            lock_manager: Optional session lock manager override.

        Raises:
            ValueError: Authentication is enabled but no owner was supplied.
        """
        self.db_session = db_session
        self.settings = settings
        if owner_id is None and settings.enable_auth:
            message = "An authenticated owner is required."
            raise ValueError(message)
        self.owner_id = owner_id or BOOTSTRAP_USER_ID
        if not settings.enable_auth and owner_id is None:
            UserService(db_session).ensure_bootstrap()
        self.prompt_loader = prompt_loader or self._default_prompt_loader(settings)
        self._owns_llm = llm is None
        self.llm = llm or build_llm(settings=settings, prompt_loader=self.prompt_loader)
        self.renderer = MarkdownRenderer(self.prompt_loader)
        self.lock_manager = lock_manager or NoopSessionLockManager()
        self.sessions = SessionRepository(db_session)
        self.messages = MessageRepository(db_session)
        self.documents = DocumentRepository(db_session)
        self.transitions = TransitionRepository(db_session)
        self.open_questions = OpenQuestionRepository(db_session)
        self.human_reviews = HumanReviewRepository(db_session)
        self.graph = build_turn_graph(llm=self.llm, renderer=self.renderer)

    def _require_owned(self, session_id: str) -> SessionRecord:
        """Require an active owner and hide sessions belonging to other users.

        Args:
            session_id: str: Requested session identifier.

        Returns:
            SessionRecord: Authorized row.

        Raises:
            missing_session: The session is absent or belongs to another user.
        """
        record = self.sessions.get(session_id)
        user = UserService(self.db_session).get_active(self.owner_id)
        if (
            record is None
            or record.owner_id != self.owner_id
            or user is None
            or self.sessions.to_state(record).deleted
        ):
            raise NotFoundError.missing_session(session_id)
        return record

    def create_session(self, title: str = "Untitled session") -> SessionOverview:
        """Create a new brainstorming session.

        Args:
            title (str): Initial session title.

        Returns:
            SessionOverview: Created session overview.

        Raises:
            ValueError: The owner is missing or inactive.
        """
        if UserService(self.db_session).get_active(self.owner_id) is None:
            message = "An active owner is required."
            raise ValueError(message)
        session_id = str(uuid4())
        state = BrainstormSessionState(session_id=session_id, title=title)
        self.sessions.create(state, owner_id=self.owner_id)
        welcome_turn = ConversationTurn(
            session_id=session_id,
            role=MessageRole.ASSISTANT,
            content="Please share your initial project pitch. Keep it free-form if needed.",
            modality=Modality.TEXT,
            stage=Stage.STAGE_0_PITCH,
        )
        self.messages.add(welcome_turn)
        self.db_session.commit()
        record = self._require_owned(session_id)
        return self.sessions.overview(record, [])

    async def aprocess_user_message(
        self,
        *,
        session_id: str,
        content: str,
        modality: Modality = Modality.TEXT,
        on_delta: Callable[[str], Awaitable[None]] | None = None,
    ) -> AssistantTurnOutput:
        """Process one user message through the orchestration graph.

        Args:
            session_id: Session identifier.
            content: User message content.
            modality: Input modality.
            on_delta: Optional async reply delta consumer.

        Returns:
            AssistantTurnOutput: Structured assistant response.

        Raises:
            pending_human_review_in_progress: If a human validation decision is still pending.
        """
        self._require_owned(session_id)
        with self.lock_manager.lock(session_id):
            record = self._require_owned(session_id)
            state = self.sessions.to_state(record)
            if state.pending_human_review is not None:
                raise ConflictError.pending_human_review_in_progress()
            current_stage = state.current_stage
            if (
                self._owns_llm
                and isinstance(self.llm, OpenAICompatibleBrainstormLLM)
                and self.llm.client.is_closed()
            ):
                self.llm = build_llm(settings=self.settings, prompt_loader=self.prompt_loader)
                self.graph = build_turn_graph(llm=self.llm, renderer=self.renderer)
            comments = [item for item in state.comments if not item.consumed]
            context = content
            if comments:
                context += "\n\nOwner section comments:\n" + "\n".join(
                    f"[{item.stage.value}/{item.section}] {item.body}" for item in comments
                )
            graph_output = await self._invoke_graph(
                {
                    "session_id": session_id,
                    "session_state": state.model_dump(mode="json"),
                    "current_stage": current_stage.value,
                    "user_message": context,
                    "on_delta": on_delta,
                },
            )
            output = AssistantTurnOutput.model_validate(graph_output["assistant_output"])
            processed_stage_state = StageState(
                stage=output.processed_stage,
                contradictions=graph_output["analysis"]["contradictions"],
                partial_fields={
                    item["field"]: item["reason"] for item in graph_output["analysis"]["partial_fields"]
                },
                coverage=output.coverage,
                readiness=output.readiness,
                clarifications=graph_output["analysis"]["clarifications"],
                summary=output.summary,
                assistant_message=output.assistant_message,
                extracted_fields=graph_output["analysis"]["extracted_fields"],
                facts=output.facts,
                assumptions=output.assumptions,
                decisions=output.decisions,
                uncertainties=output.uncertainties,
                open_questions=graph_output["analysis"]["open_questions"],
                risks=output.risks,
                latest_markdown=output.step_markdown,
                stage_is_clear_enough=output.stage_clear_enough,
                transition_decision_reason=output.transition_decision_reason,
            )
            state.stage_states[output.processed_stage.value] = processed_stage_state
            proposed_next_stage = output.next_stage
            if (
                self.settings.require_human_validation_for_transitions
                and output.stage_clear_enough
                and proposed_next_stage is not None
            ):
                pending_review = PendingHumanReview(
                    from_stage=output.processed_stage,
                    to_stage=proposed_next_stage,
                    summary=output.summary,
                    transition_decision_reason=output.transition_decision_reason,
                )
                state.pending_human_review = pending_review
                state.current_stage = output.processed_stage
                output.current_stage = output.processed_stage
                output.requires_human_review = True
                output.pending_review = pending_review
                output.assistant_message = (
                    f"{output.assistant_message.rstrip()}\n\n"
                    "Human validation is required before advancing to the next stage."
                )
            else:
                state.current_stage = output.current_stage
                output.pending_review = None
            for comment in comments:
                comment.consumed = True
            state.transcript.extend([
                {"role": "user", "content": content},
                {"role": "assistant", "content": output.assistant_message},
            ])
            state.transcript = (
                state.transcript[-self.settings.llm_context_turns :]
                if self.settings.llm_context_turns
                else []
            )
            self.messages.add(
                ConversationTurn(
                    session_id=session_id,
                    role=MessageRole.USER,
                    content=content,
                    modality=modality,
                    stage=current_stage,
                ),
            )
            assistant_id = str(uuid4())
            state.turn_usage[assistant_id] = {
                "prompt_tokens": output.prompt_tokens,
                "completion_tokens": output.completion_tokens,
            }
            self.sessions.save_state(session_id, state)
            self.messages.add(
                ConversationTurn(
                    session_id=session_id,
                    id=assistant_id,
                    role=MessageRole.ASSISTANT,
                    content=output.assistant_message,
                    modality=Modality.TEXT,
                    stage=output.processed_stage,
                ),
            )
            version = (
                len(
                    [
                        item
                        for item in self.documents.list_all(session_id)
                        if item.stage is output.processed_stage
                    ],
                )
                + 1
            )
            self.documents.create_version(
                StepDocument(
                    session_id=session_id,
                    stage=output.processed_stage,
                    version=version,
                    markdown=output.step_markdown,
                    summary=output.summary,
                    facts=output.facts,
                    assumptions=output.assumptions,
                    decisions=output.decisions,
                    uncertainties=output.uncertainties,
                    open_questions=graph_output["analysis"]["open_questions"],
                    risks=output.risks,
                ),
            )
            self.open_questions.sync_stage_questions(
                session_id=session_id,
                stage=output.processed_stage,
                questions=processed_stage_state.open_questions,
            )
            validation = graph_output["validation"]
            self.transitions.add(
                session_id=session_id,
                from_stage=output.processed_stage,
                to_stage=output.next_stage,
                validation=validation,
            )
            self.db_session.commit()
            return output

    async def _invoke_graph(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Run the async graph and close owned transports in the same event loop.

        Args:
            payload (dict[str, Any]): Initial graph state.

        Returns:
            dict[str, Any]: Completed graph state.
        """
        try:
            return await self.graph.ainvoke(payload)
        finally:
            if self._owns_llm and isinstance(self.llm, OpenAICompatibleBrainstormLLM):
                await self.llm.client.close()

    def process_user_message(
        self,
        *,
        session_id: str,
        content: str,
        modality: Modality = Modality.TEXT,
    ) -> AssistantTurnOutput:
        """Process a turn for synchronous API callers.

        Args:
            session_id (str): Session id.
            content (str): User input.
            modality (Modality): Input modality.

        Returns:
            AssistantTurnOutput: Committed assistant response.
        """
        return run_async(
            self.aprocess_user_message(session_id=session_id, content=content, modality=modality),
        )

    def get_session(self, session_id: str) -> SessionOverview:
        """Return the current session overview.

        Args:
            session_id: Session identifier.

        Returns:
            SessionOverview: Current session overview.

        """
        record = self._require_owned(session_id)
        state = self.sessions.to_state(record)
        metadata = {
            question.id: question
            for stage_state in state.stage_states.values()
            for question in stage_state.open_questions
        }
        questions = [
            metadata.get(question.id, question) for question in self.open_questions.list_open(session_id)
        ]
        return self.sessions.overview(record, questions)

    def list_messages(self, session_id: str) -> list[ConversationTurn]:
        """Return ordered message history for a session.

        Args:
            session_id: Session identifier.

        Returns:
            list[ConversationTurn]: Session message history.
        """
        usage = self.sessions.to_state(self._require_owned(session_id)).turn_usage
        turns = self.messages.list_for_session(session_id)
        for turn in turns:
            counts = usage.get(turn.id, {})
            turn.prompt_tokens = counts.get("prompt_tokens", 0)
            turn.completion_tokens = counts.get("completion_tokens", 0)
        return turns

    def get_current_document(self, session_id: str) -> StepDocument:
        """Return the latest current document for a session.

        Args:
            session_id: Session identifier.

        Returns:
            StepDocument: Latest current document.

        Raises:
            missing_document: If no document exists yet.
        """
        self._require_owned(session_id)
        document = self.documents.get_current(session_id)
        if document is None:
            raise NotFoundError.missing_document(session_id)
        return document

    def list_documents(self, session_id: str) -> list[StepDocument]:
        """Return all documents for a session.

        Args:
            session_id: Session identifier.

        Returns:
            list[StepDocument]: Versioned documents.
        """
        self._require_owned(session_id)
        return self.documents.list_all(session_id)

    def export_markdown(self, session_id: str) -> str:
        """Export the latest session documents into one Markdown artifact.

        Args:
            session_id: Session identifier.

        Returns:
            str: Consolidated Markdown export.
        """
        overview = self.get_session(session_id)
        messages = self.list_messages(session_id)
        documents_by_stage = {item.stage: item for item in self.list_documents(session_id) if item.version}
        sections = [
            "# Brainstorm Session Export",
            "",
            f"- Session ID: `{overview.session_id}`",
            f"- Current stage: `{overview.current_stage.value}`",
            f"- Pending human review: `{bool(overview.pending_human_review)}`",
            "",
            "## Conversation Summary",
            "",
            f"- Message count: `{len(messages)}`",
            f"- Open questions: `{len(overview.open_questions)}`",
            "",
        ]
        for stage in Stage.ordered():
            document = documents_by_stage.get(stage)
            if document is None:
                continue
            sections.extend(
                [
                    f"## {stage.label}",
                    "",
                    document.markdown.strip(),
                    "",
                ],
            )
        return "\n".join(sections).strip() + "\n"

    def export_json(self, session_id: str) -> dict[str, object]:
        """Export a full structured session snapshot.

        Args:
            session_id: Session identifier.

        Returns:
            dict[str, object]: Structured export payload.
        """
        overview = self.get_session(session_id)
        return {
            "session": overview.model_dump(mode="json"),
            "messages": [item.model_dump(mode="json") for item in self.list_messages(session_id)],
            "documents": [item.model_dump(mode="json") for item in self.list_documents(session_id)],
            "human_reviews": [item.model_dump(mode="json") for item in self.list_human_reviews(session_id)],
        }

    def review_pending_transition(
        self,
        *,
        session_id: str,
        approved: bool,
        note: str | None = None,
        expected_stage: Stage | None = None,
        request_changes: bool = False,
    ) -> SessionOverview:
        """Approve or reject the pending human-reviewed transition.

        Args:
            session_id: Session identifier.
            approved: Whether to approve the pending transition.
            note: Optional reviewer note.
            expected_stage: Stage expected by the application caller.
            request_changes: Record an explicit request for changes.

        Returns:
            SessionOverview: Updated session overview.

        Raises:
            no_pending_human_review: If the session has no pending human review.
            ConflictError: Review stage no longer matches.
        """
        self._require_owned(session_id)
        with self.lock_manager.lock(session_id):
            record = self._require_owned(session_id)
            state = self.sessions.to_state(record)
            pending = state.pending_human_review
            if pending is None:
                raise ConflictError.no_pending_human_review()
            if expected_stage is not None and pending.from_stage != expected_stage:
                message = "Review does not match the pending stage."
                raise ConflictError(message)
            if note:
                state.comments.append(SectionComment(stage=pending.from_stage, section="Review", body=note))
            review = HumanReviewRecord(
                session_id=session_id,
                from_stage=pending.from_stage,
                proposed_next_stage=pending.to_stage,
                decision=(
                    HumanReviewDecision.APPROVED
                    if approved
                    else HumanReviewDecision.REQUEST_CHANGES
                    if request_changes
                    else HumanReviewDecision.REJECTED
                ),
                note=note,
            )
            self.human_reviews.add(review)
            if approved and pending.to_stage is not None:
                state.current_stage = pending.to_stage
            state.pending_human_review = None
            self.sessions.save_state(session_id, state)
            self.db_session.commit()
            state = self.sessions.to_state(record)
        metadata = {
            question.id: question
            for stage_state in state.stage_states.values()
            for question in stage_state.open_questions
        }
        questions = [
            metadata.get(question.id, question) for question in self.open_questions.list_open(session_id)
        ]
        return self.sessions.overview(record, questions)

    def list_human_reviews(self, session_id: str) -> list[HumanReviewRecord]:
        """Return all human review decisions for a session.

        Args:
            session_id: Session identifier.

        Returns:
            list[HumanReviewRecord]: Ordered review decisions.
        """
        self._require_owned(session_id)
        return self.human_reviews.list_for_session(session_id)

    def list_sessions(self, *, offset: int, limit: int, include_archived: bool) -> SessionPage:
        """List live sessions for the active owner.

        Args:
            offset (int): Number of records to skip.
            limit (int): Page size.
            include_archived (bool): Include archived sessions.

        Returns:
            SessionPage: Owner-scoped page and total.
        """
        rows = self.db_session.scalars(
            select(SessionRecord)
            .where(
                SessionRecord.owner_id == self.owner_id,
            )
            .order_by(SessionRecord.created_at.desc(), SessionRecord.id),
        ).all()
        items = []
        if UserService(self.db_session).get_active(self.owner_id):
            for row in rows:
                state = self.sessions.to_state(row)
                if not state.deleted and (include_archived or not state.archived):
                    items.append(self.sessions.overview(row, self.open_questions.list_open(row.id)))
        return SessionPage(items=items[offset : offset + limit], total=len(items), offset=offset, limit=limit)

    def update_session(
        self,
        session_id: str,
        patch: SessionPatch,
        *,
        delete: bool = False,
    ) -> SessionOverview:
        """Update metadata or soft-delete an owned session.

        Args:
            session_id (str): Session id.
            patch (SessionPatch): Metadata changes.
            delete (bool): Hide session from every access path.

        Returns:
            SessionOverview: Committed metadata.
        """
        self._require_owned(session_id)
        with self.lock_manager.lock(session_id):
            record = self._require_owned(session_id)
            state = self.sessions.to_state(record)
            for key, value in patch.model_dump(exclude_none=True).items():
                setattr(state, key, value)
            state.deleted = delete
            self.sessions.save_state(session_id, state)
            self.db_session.commit()
            return self.sessions.overview(record, self.open_questions.list_open(session_id))

    def reopen_stage(self, session_id: str, stage: Stage) -> SessionOverview:
        """Reopen an earlier visited stage and invalidate all downstream state.

        Args:
            session_id (str): Owned session.
            stage (Stage): Previously visited stage.

        Returns:
            SessionOverview: Reopened state.

        Raises:
            ConflictError: Target is not an earlier visited stage.
        """
        self._require_owned(session_id)
        with self.lock_manager.lock(session_id):
            record = self._require_owned(session_id)
            state = self.sessions.to_state(record)
            ordered = Stage.ordered()
            if stage.value not in state.stage_states or ordered.index(stage) >= ordered.index(
                state.current_stage,
            ):
                message = "Only an earlier visited stage can be reopened."
                raise ConflictError(message)
            for key, value in state.stage_states.items():
                if ordered.index(Stage(key)) > ordered.index(stage):
                    value.stale = True
            state.current_stage = stage
            state.pending_human_review = None
            state.stage_states[stage.value].stage_is_clear_enough = False
            self.sessions.save_state(session_id, state)
            self.db_session.commit()
            return self.get_session(session_id)

    def edit_stage(self, session_id: str, stage: Stage, patch: StagePatch) -> SessionOverview:
        """Edit current stage fields/items and regenerate a validated document.

        Args:
            session_id (str): Owned session.
            stage (Stage): Active stage; reopen earlier stages first.
            patch (StagePatch): Supplied field values and replacement collections.

        Returns:
            SessionOverview: Revalidated state.

        Raises:
            ConflictError: Stage is inactive or an edit violates the typed contract.
        """
        self._require_owned(session_id)
        with self.lock_manager.lock(session_id):
            record = self._require_owned(session_id)
            state = self.sessions.to_state(record)
            if stage != state.current_stage:
                message = "Reopen the stage before editing it."
                raise ConflictError(message)
            current = state.stage_states.get(stage.value, StageState(stage=stage))
            data = current.model_dump()
            data["extracted_fields"] = current.extracted_fields.model_dump() | patch.fields
            allowed = {"facts", "assumptions", "decisions", "risks", "open_questions"}
            if patch.items.keys() - allowed:
                message = "Unknown item collection."
                raise ConflictError(message)
            data.update(patch.items)
            try:
                current = StageState.model_validate(data)
            except ValidationError as exc:
                message = "Edit does not match the stage contract."
                raise ConflictError(message) from exc
            current.partial_fields = {
                key: value for key, value in current.partial_fields.items() if key not in patch.fields
            }
            analysis_data = {
                key: value
                for key, value in current.model_dump().items()
                if key in AssistantAnalysis.model_fields and key != "partial_fields"
            }
            analysis_data["partial_fields"] = [
                {"field": key, "reason": value} for key, value in current.partial_fields.items()
            ]
            validated = apply_stage_rules({
                "session_id": session_id,
                "current_stage": stage.value,
                "session_state": state.model_dump(mode="json"),
                "user_message": "",
                "analysis": analysis_data,
            })
            analysis = AssistantAnalysis.model_validate(validated["analysis"])
            validation = StageValidationResult.model_validate(validated["validation"])
            current.open_questions = analysis.open_questions
            current.coverage = validation.coverage
            current.readiness = validation.readiness
            current.stage_is_clear_enough = validation.stage_is_clear_enough
            current.transition_decision_reason = validation.transition_decision_reason
            current.stale = False
            current.latest_markdown = self.renderer.render(
                stage=stage,
                analysis=analysis,
                validation=validation,
            )
            state.stage_states[stage.value] = current
            state.pending_human_review = None
            versions = [item.version for item in self.documents.list_all(session_id) if item.stage == stage]
            document = StepDocument(
                session_id=session_id,
                stage=stage,
                version=max(versions, default=0) + 1,
                markdown=current.latest_markdown,
                summary=current.summary,
                facts=current.facts,
                assumptions=current.assumptions,
                decisions=current.decisions,
                uncertainties=current.uncertainties,
                open_questions=current.open_questions,
                risks=current.risks,
            )
            self.documents.create_version(document)
            self.open_questions.sync_stage_questions(
                session_id=session_id,
                stage=stage,
                questions=current.open_questions,
            )
            self.sessions.save_state(session_id, state)
            self.db_session.commit()
            return self.get_session(session_id)

    def add_comment(self, session_id: str, comment: CommentInput) -> SessionOverview:
        """Persist section feedback for the next successful turn.

        Args:
            session_id (str): Owned session.
            comment (CommentInput): Section and feedback.

        Returns:
            SessionOverview: State including the comment.
        """
        self._require_owned(session_id)
        with self.lock_manager.lock(session_id):
            record = self._require_owned(session_id)
            state = self.sessions.to_state(record)
            state.comments.append(SectionComment(**comment.model_dump()))
            self.sessions.save_state(session_id, state)
            self.db_session.commit()
            return self.get_session(session_id)

    def submit_review(self, session_id: str, review: ReviewInput) -> SessionOverview:
        """Apply an explicit review action to the pending stage.

        Args:
            session_id (str): Owned session.
            review (ReviewInput): Action and note.

        Returns:
            SessionOverview: Updated session.

        Raises:
            ConflictError: Review stage does not match pending review.
        """
        overview = self.get_session(session_id)
        if overview.pending_human_review is None or overview.pending_human_review.from_stage != review.stage:
            message = "Review does not match the pending stage."
            raise ConflictError(message)
        return self.review_pending_transition(
            session_id=session_id,
            approved=review.action == ReviewAction.APPROVE,
            note=review.note,
            expected_stage=review.stage,
            request_changes=review.action == ReviewAction.REQUEST_CHANGES,
        )

    def document_diff(
        self,
        session_id: str,
        stage: Stage,
        from_version: int,
        to_version: int,
    ) -> DocumentDiff:
        """Compare immutable versions within one owned stage.

        Args:
            session_id (str): Owned session.
            stage (Stage): Document stage.
            from_version (int): Source version.
            to_version (int): Target version.

        Returns:
            DocumentDiff: Unified diff.

        Raises:
            NotFoundError: Either version is missing.
        """
        versions = {item.version: item for item in self.list_documents(session_id) if item.stage == stage}
        if from_version not in versions or to_version not in versions:
            message = "Document version was not found."
            raise NotFoundError(message)
        diff = "".join(
            difflib.unified_diff(
                versions[from_version].markdown.splitlines(keepends=True),
                versions[to_version].markdown.splitlines(keepends=True),
                fromfile=str(from_version),
                tofile=str(to_version),
            ),
        )
        return DocumentDiff(stage=stage, from_version=from_version, to_version=to_version, diff=diff)

    def export_backlog(self, session_id: str) -> BacklogExport:
        """Export existing backlog items; slicing metadata is deferred to lot 4.

        Args:
            session_id (str): Owned session.

        Returns:
            BacklogExport: Existing typed backlog items.
        """
        state = self.sessions.to_state(self._require_owned(session_id))
        backlog = state.stage_states.get(Stage.STAGE_6_BACKLOG_SYNTHESIS.value)
        fields = backlog.extracted_fields.model_dump(exclude_none=True) if backlog else {}
        return BacklogExport(
            items=[dict(item, collection=key) for key, values in fields.items() for item in values],
        )

    def export_slice_specs(self, session_id: str) -> SliceSpecsExport:
        """Return documented empty specs until delivery slicing exists.

        Args:
            session_id (str): Owned session.

        Returns:
            SliceSpecsExport: Explicit unavailable status.
        """
        self._require_owned(session_id)
        return SliceSpecsExport()

    def prepare_turn(self, session_id: str) -> None:
        """Authorize before sending stream headers.

        Args:
            session_id (str): Owned session.

        Raises:
            pending_human_review_in_progress: Human review is pending.
        """
        if self.get_session(session_id).pending_human_review is not None:
            raise ConflictError.pending_human_review_in_progress()

    async def stream_turn(self, session_id: str, content: str) -> AsyncIterator[TurnEvent]:
        """Stream tentative provider deltas then committed state or terminal error.

        Args:
            session_id (str): Authorized session.
            content (str): User message.

        Yields:
            TurnEvent: Ordered typed event, exactly one terminal event.
        """
        stage = self.get_session(session_id).current_stage
        turn_id = str(uuid4())
        yield TurnStarted(turn_id=turn_id, stage=stage)
        yield AnalysisStatus()
        queue: asyncio.Queue[str] = asyncio.Queue()

        async def on_delta(delta: str) -> None:
            await queue.put(delta)

        task = asyncio.create_task(
            self.aprocess_user_message(session_id=session_id, content=content, on_delta=on_delta),
        )
        try:
            while not task.done() or not queue.empty():
                waiter = asyncio.create_task(queue.get())
                await asyncio.wait({task, waiter}, return_when=asyncio.FIRST_COMPLETED)
                if waiter.done():
                    yield MessageDelta(delta=waiter.result())
                else:
                    waiter.cancel()
                    with suppress(asyncio.CancelledError):
                        await waiter
            output = await task
            document = next(
                item
                for item in reversed(self.list_documents(session_id))
                if item.stage == output.processed_stage
            )
            overview = self.get_session(session_id)
            yield DocumentUpdated(document=document)
            yield CoverageUpdated(stage=overview.stage_states[stage.value])
            if output.current_stage != stage:
                yield StageChanged(from_stage=stage, to_stage=output.current_stage)
            if output.pending_review:
                yield ReviewRequired(review=output.pending_review)
            yield TurnCompleted(turn_id=turn_id, output=output)
        except Exception:
            self.db_session.rollback()
            yield TurnError()
        finally:
            if not task.done():
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task
