"""Application service for session lifecycle and conversation turns."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any
from uuid import uuid4

from brainstorm_agent.async_runner import run_async
from brainstorm_agent.core.enums import HumanReviewDecision, MessageRole, Modality, Stage
from brainstorm_agent.core.models import (
    AssistantTurnOutput,
    BrainstormSessionState,
    ConversationTurn,
    HumanReviewRecord,
    PendingHumanReview,
    SessionOverview,
    StageState,
    StepDocument,
)
from brainstorm_agent.exceptions import ConflictError, NotFoundError
from brainstorm_agent.graph.builder import build_turn_graph
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


class SessionService:
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
        if record is None or record.owner_id != self.owner_id or user is None:
            raise NotFoundError.missing_session(session_id)
        return record

    def create_session(self) -> SessionOverview:
        """Create a new brainstorming session.

        Returns:
            SessionOverview: Created session overview.

        Raises:
            ValueError: The owner is missing or inactive.
        """
        if UserService(self.db_session).get_active(self.owner_id) is None:
            message = "An active owner is required."
            raise ValueError(message)
        session_id = str(uuid4())
        state = BrainstormSessionState(session_id=session_id)
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
    ) -> AssistantTurnOutput:
        """Process one user message through the orchestration graph.

        Args:
            session_id: Session identifier.
            content: User message content.
            modality: Input modality.

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
            graph_output = await self._invoke_graph(
                {
                    "session_id": session_id,
                    "session_state": state.model_dump(mode="json"),
                    "current_stage": current_stage.value,
                    "user_message": content,
                },
            )
            output = AssistantTurnOutput.model_validate(graph_output["assistant_output"])
            processed_stage_state = StageState(
                stage=output.processed_stage,
                summary=output.summary,
                assistant_message=output.assistant_message,
                extracted_fields=graph_output["analysis"]["extracted_fields"],
                facts=output.facts,
                assumptions=output.assumptions,
                decisions=output.decisions,
                uncertainties=output.uncertainties,
                open_questions=output.open_questions,
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
                    open_questions=output.open_questions,
                    risks=output.risks,
                ),
            )
            self.open_questions.sync_stage_questions(
                session_id=session_id,
                stage=output.processed_stage,
                questions=output.open_questions,
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
        return self.sessions.overview(record, self.open_questions.list_open(session_id))

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
    ) -> SessionOverview:
        """Approve or reject the pending human-reviewed transition.

        Args:
            session_id: Session identifier.
            approved: Whether to approve the pending transition.
            note: Optional reviewer note.

        Returns:
            SessionOverview: Updated session overview.

        Raises:
            no_pending_human_review: If the session has no pending human review.
        """
        self._require_owned(session_id)
        with self.lock_manager.lock(session_id):
            record = self._require_owned(session_id)
            state = self.sessions.to_state(record)
            pending = state.pending_human_review
            if pending is None:
                raise ConflictError.no_pending_human_review()
            review = HumanReviewRecord(
                session_id=session_id,
                from_stage=pending.from_stage,
                proposed_next_stage=pending.to_stage,
                decision=(HumanReviewDecision.APPROVED if approved else HumanReviewDecision.REJECTED),
                note=note,
            )
            self.human_reviews.add(review)
            if approved and pending.to_stage is not None:
                state.current_stage = pending.to_stage
            state.pending_human_review = None
            self.sessions.save_state(session_id, state)
            self.db_session.commit()
            return self.sessions.overview(record, self.open_questions.list_open(session_id))

    def list_human_reviews(self, session_id: str) -> list[HumanReviewRecord]:
        """Return all human review decisions for a session.

        Args:
            session_id: Session identifier.

        Returns:
            list[HumanReviewRecord]: Ordered review decisions.
        """
        self._require_owned(session_id)
        return self.human_reviews.list_for_session(session_id)
