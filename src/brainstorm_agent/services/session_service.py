"""Application service for session lifecycle and conversation turns."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import uuid4

from brainstorm_agent.core.enums import MessageRole, Modality, Stage
from brainstorm_agent.core.models import (
    AssistantTurnOutput,
    BrainstormSessionState,
    ConversationTurn,
    SessionOverview,
    StageState,
    StepDocument,
)
from brainstorm_agent.exceptions import NotFoundError
from brainstorm_agent.graph.builder import build_turn_graph
from brainstorm_agent.persistence.repositories import (
    DocumentRepository,
    MessageRepository,
    OpenQuestionRepository,
    SessionRepository,
    TransitionRepository,
)
from brainstorm_agent.services.llm_client import BrainstormLLM, build_llm
from brainstorm_agent.services.locks import NoopSessionLockManager, SessionLockManager
from brainstorm_agent.services.markdown import MarkdownRenderer
from brainstorm_agent.services.prompt_loader import PromptLoader

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

    def __init__(
        self,
        *,
        db_session: Session,
        settings: Settings,
        llm: BrainstormLLM | None = None,
        prompt_loader: PromptLoader | None = None,
        lock_manager: SessionLockManager | None = None,
    ) -> None:
        """Initialize the session service.

        Args:
            db_session: Database session.
            settings: Application settings.
            llm: Optional structured LLM adapter override.
            prompt_loader: Optional prompt loader override.
            lock_manager: Optional session lock manager override.
        """
        self.db_session = db_session
        self.settings = settings
        self.prompt_loader = prompt_loader or self._default_prompt_loader(settings)
        self.llm = llm or build_llm(settings=settings, prompt_loader=self.prompt_loader)
        self.renderer = MarkdownRenderer(self.prompt_loader)
        self.lock_manager = lock_manager or NoopSessionLockManager()
        self.sessions = SessionRepository(db_session)
        self.messages = MessageRepository(db_session)
        self.documents = DocumentRepository(db_session)
        self.transitions = TransitionRepository(db_session)
        self.open_questions = OpenQuestionRepository(db_session)
        self.graph = build_turn_graph(llm=self.llm, renderer=self.renderer)

    def create_session(self) -> SessionOverview:
        """Create a new brainstorming session.

        Returns:
            SessionOverview: Created session overview.
        """
        session_id = str(uuid4())
        state = BrainstormSessionState(session_id=session_id)
        self.sessions.create(state)
        welcome_turn = ConversationTurn(
            session_id=session_id,
            role=MessageRole.ASSISTANT,
            content="Please share your initial project pitch. Keep it free-form if needed.",
            modality=Modality.TEXT,
            stage=Stage.STAGE_0_PITCH,
        )
        self.messages.add(welcome_turn)
        self.db_session.commit()
        record = self.sessions.require(session_id)
        return self.sessions.overview(record, [])

    def process_user_message(
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
            missing_session: If the session does not exist.
        """
        with self.lock_manager.lock(session_id):
            record = self.sessions.get(session_id)
            if record is None:
                raise NotFoundError.missing_session(session_id)
            state = self.sessions.to_state(record)
            current_stage = state.current_stage
            self.messages.add(
                ConversationTurn(
                    session_id=session_id,
                    role=MessageRole.USER,
                    content=content,
                    modality=modality,
                    stage=current_stage,
                ),
            )
            graph_output = self.graph.invoke(
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
            state.current_stage = output.current_stage
            self.sessions.save_state(session_id, state)
            self.messages.add(
                ConversationTurn(
                    session_id=session_id,
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

    def get_session(self, session_id: str) -> SessionOverview:
        """Return the current session overview.

        Args:
            session_id: Session identifier.

        Returns:
            SessionOverview: Current session overview.

        Raises:
            missing_session: If the session does not exist.
        """
        record = self.sessions.get(session_id)
        if record is None:
            raise NotFoundError.missing_session(session_id)
        return self.sessions.overview(record, self.open_questions.list_open(session_id))

    def list_messages(self, session_id: str) -> list[ConversationTurn]:
        """Return ordered message history for a session.

        Args:
            session_id: Session identifier.

        Returns:
            list[ConversationTurn]: Session message history.
        """
        self.sessions.require(session_id)
        return self.messages.list_for_session(session_id)

    def get_current_document(self, session_id: str) -> StepDocument:
        """Return the latest current document for a session.

        Args:
            session_id: Session identifier.

        Returns:
            StepDocument: Latest current document.

        Raises:
            missing_document: If no document exists yet.
        """
        self.sessions.require(session_id)
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
        self.sessions.require(session_id)
        return self.documents.list_all(session_id)
