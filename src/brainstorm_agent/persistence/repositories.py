"""Repositories for persistence access."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Select, desc, func, select, update

from brainstorm_agent.core.enums import MessageRole, Modality, OpenQuestionStatus, Stage
from brainstorm_agent.core.models import (
    BrainstormSessionState,
    ConversationTurn,
    OpenQuestionItem,
    SessionOverview,
    StepDocument,
)
from brainstorm_agent.exceptions import NotFoundError
from brainstorm_agent.persistence.models import (
    DocumentRecord,
    MessageRecord,
    OpenQuestionRecord,
    SessionRecord,
    TransitionDecisionRecord,
)

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


def _utc_now() -> datetime:
    return datetime.now(tz=UTC)


class SessionRepository:
    """Persistence operations for sessions."""

    def __init__(self, db_session: Session) -> None:
        """Initialize the repository.

        Args:
            db_session: Database session.
        """
        self.db_session = db_session

    def create(self, state: BrainstormSessionState) -> SessionRecord:
        """Create a session row.

        Args:
            state: Session state to persist.

        Returns:
            SessionRecord: Created ORM record.
        """
        record = SessionRecord(
            id=state.session_id,
            current_stage=state.current_stage.value,
            state_payload=state.model_dump(mode="json"),
        )
        self.db_session.add(record)
        self.db_session.flush()
        return record

    def get(self, session_id: str) -> SessionRecord | None:
        """Load a session by id.

        Args:
            session_id: Session identifier.

        Returns:
            SessionRecord | None: Matching record if found.
        """
        return self.db_session.get(SessionRecord, session_id)

    def require(self, session_id: str) -> SessionRecord:
        """Require that a session exists.

        Args:
            session_id: Session identifier.

        Returns:
            SessionRecord: Matching record.

        Raises:
            missing_session: If the session does not exist.
        """
        record = self.get(session_id)
        if record is None:
            raise NotFoundError.missing_session(session_id)
        return record

    def save_state(self, session_id: str, state: BrainstormSessionState) -> SessionRecord:
        """Persist the latest state snapshot.

        Args:
            session_id: Session identifier.
            state: Updated session state.

        Returns:
            SessionRecord: Updated record.
        """
        record = self.require(session_id)
        record.current_stage = state.current_stage.value
        record.state_payload = state.model_dump(mode="json")
        record.updated_at = _utc_now()
        self.db_session.add(record)
        self.db_session.flush()
        return record

    @staticmethod
    def to_state(record: SessionRecord) -> BrainstormSessionState:
        """Convert an ORM session row into a domain state.

        Args:
            record: ORM session row.

        Returns:
            BrainstormSessionState: Parsed state.
        """
        return BrainstormSessionState.model_validate(record.state_payload)

    def overview(self, record: SessionRecord, open_questions: list[OpenQuestionItem]) -> SessionOverview:
        """Build a session overview model.

        Args:
            record: Session ORM row.
            open_questions: Active open questions.

        Returns:
            SessionOverview: Session snapshot.
        """
        state = self.to_state(record)
        completed_stages = [
            Stage(stage_name)
            for stage_name, stage_state in state.stage_states.items()
            if stage_state.stage_is_clear_enough
        ]
        return SessionOverview(
            session_id=record.id,
            current_stage=Stage(record.current_stage),
            created_at=record.created_at,
            updated_at=record.updated_at,
            open_questions=open_questions,
            completed_stages=completed_stages,
        )


class MessageRepository:
    """Persistence operations for conversation history."""

    def __init__(self, db_session: Session) -> None:
        """Initialize the repository.

        Args:
            db_session: Database session.
        """
        self.db_session = db_session

    def _next_turn_index(self, session_id: str) -> int:
        query: Select[tuple[int | None]] = select(func.max(MessageRecord.turn_index)).where(
            MessageRecord.session_id == session_id,
        )
        current = self.db_session.execute(query).scalar_one()
        return 0 if current is None else current + 1

    def add(self, turn: ConversationTurn) -> MessageRecord:
        """Persist one conversation turn.

        Args:
            turn: Domain conversation turn.

        Returns:
            MessageRecord: Created ORM row.
        """
        record = MessageRecord(
            id=turn.id,
            session_id=turn.session_id,
            role=turn.role.value,
            content=turn.content,
            modality=turn.modality.value,
            stage=turn.stage.value,
            turn_index=self._next_turn_index(turn.session_id),
            created_at=turn.created_at,
        )
        self.db_session.add(record)
        self.db_session.flush()
        return record

    def list_for_session(self, session_id: str) -> list[ConversationTurn]:
        """List messages for a session.

        Args:
            session_id: Session identifier.

        Returns:
            list[ConversationTurn]: Ordered message history.
        """
        query = (
            select(MessageRecord)
            .where(MessageRecord.session_id == session_id)
            .order_by(MessageRecord.turn_index.asc(), MessageRecord.created_at.asc())
        )
        rows = self.db_session.execute(query).scalars().all()
        return [
            ConversationTurn(
                id=row.id,
                session_id=row.session_id,
                role=MessageRole(row.role),
                content=row.content,
                modality=Modality(row.modality),
                stage=Stage(row.stage),
                created_at=row.created_at,
            )
            for row in rows
        ]


class DocumentRepository:
    """Persistence operations for stage documents."""

    def __init__(self, db_session: Session) -> None:
        """Initialize the repository.

        Args:
            db_session: Database session.
        """
        self.db_session = db_session

    def _next_version(self, session_id: str, stage: Stage) -> int:
        query = select(func.max(DocumentRecord.version)).where(
            DocumentRecord.session_id == session_id,
            DocumentRecord.stage == stage.value,
        )
        current = self.db_session.execute(query).scalar_one()
        return 1 if current is None else current + 1

    def create_version(self, document: StepDocument) -> DocumentRecord:
        """Persist a new current document version.

        Args:
            document: Domain document to store.

        Returns:
            DocumentRecord: Created ORM row.
        """
        self.db_session.execute(
            update(DocumentRecord)
            .where(
                DocumentRecord.session_id == document.session_id,
                DocumentRecord.stage == document.stage.value,
                DocumentRecord.is_current.is_(True),
            )
            .values(is_current=False),
        )
        record = DocumentRecord(
            id=document.id,
            session_id=document.session_id,
            stage=document.stage.value,
            version=document.version or self._next_version(document.session_id, document.stage),
            markdown=document.markdown,
            summary=document.summary,
            facts_payload=[item.model_dump(mode="json") for item in document.facts],
            assumptions_payload=[item.model_dump(mode="json") for item in document.assumptions],
            decisions_payload=[item.model_dump(mode="json") for item in document.decisions],
            uncertainties_payload=document.uncertainties,
            open_questions_payload=[item.model_dump(mode="json") for item in document.open_questions],
            risks_payload=[item.model_dump(mode="json") for item in document.risks],
            is_current=True,
            created_at=document.created_at,
        )
        self.db_session.add(record)
        self.db_session.flush()
        return record

    def get_current(self, session_id: str) -> StepDocument | None:
        """Return the latest current stage document for a session.

        Args:
            session_id: Session identifier.

        Returns:
            StepDocument | None: Current document if one exists.
        """
        query = (
            select(DocumentRecord)
            .where(DocumentRecord.session_id == session_id, DocumentRecord.is_current.is_(True))
            .order_by(desc(DocumentRecord.created_at))
        )
        record = self.db_session.execute(query).scalars().first()
        if record is None:
            return None
        return self._to_model(record)

    def list_all(self, session_id: str) -> list[StepDocument]:
        """List all versioned documents for a session.

        Args:
            session_id: Session identifier.

        Returns:
            list[StepDocument]: All documents ordered by creation time.
        """
        query = (
            select(DocumentRecord)
            .where(DocumentRecord.session_id == session_id)
            .order_by(DocumentRecord.created_at.asc())
        )
        rows = self.db_session.execute(query).scalars().all()
        return [self._to_model(row) for row in rows]

    @staticmethod
    def _to_model(record: DocumentRecord) -> StepDocument:
        return StepDocument.model_validate(
            {
                "id": record.id,
                "session_id": record.session_id,
                "stage": record.stage,
                "version": record.version,
                "markdown": record.markdown,
                "summary": record.summary,
                "facts": record.facts_payload,
                "assumptions": record.assumptions_payload,
                "decisions": record.decisions_payload,
                "uncertainties": record.uncertainties_payload,
                "open_questions": record.open_questions_payload,
                "risks": record.risks_payload,
                "created_at": record.created_at,
            },
        )


class TransitionRepository:
    """Persistence operations for transition decisions."""

    def __init__(self, db_session: Session) -> None:
        """Initialize the repository.

        Args:
            db_session: Database session.
        """
        self.db_session = db_session

    def add(
        self,
        *,
        session_id: str,
        from_stage: Stage,
        to_stage: Stage | None,
        validation: dict[str, object],
    ) -> TransitionDecisionRecord:
        """Persist one transition decision.

        Args:
            session_id: Session identifier.
            from_stage: Stage processed during the turn.
            to_stage: Resulting next stage when applicable.
            validation: Validation payload for the transition decision.

        Returns:
            TransitionDecisionRecord: Created ORM row.
        """
        record = TransitionDecisionRecord(
            id=str(uuid4()),
            session_id=session_id,
            from_stage=from_stage.value,
            to_stage=to_stage.value if to_stage else None,
            stage_is_clear_enough=bool(validation["stage_is_clear_enough"]),
            reason=str(validation["transition_decision_reason"]),
            missing_fields_payload=(
                [str(item) for item in validation["missing_fields"]]
                if isinstance(validation["missing_fields"], list)
                else []
            ),
            blocking_reasons_payload=(
                [str(item) for item in validation["blocking_reasons"]]
                if isinstance(validation["blocking_reasons"], list)
                else []
            ),
        )
        self.db_session.add(record)
        self.db_session.flush()
        return record


class OpenQuestionRepository:
    """Persistence operations for open question snapshots."""

    def __init__(self, db_session: Session) -> None:
        """Initialize the repository.

        Args:
            db_session: Database session.
        """
        self.db_session = db_session

    def sync_stage_questions(
        self,
        *,
        session_id: str,
        stage: Stage,
        questions: list[OpenQuestionItem],
    ) -> list[OpenQuestionRecord]:
        """Synchronize active questions for a session stage.

        Args:
            session_id: Session identifier.
            stage: Stage being synchronized.
            questions: New active questions.

        Returns:
            list[OpenQuestionRecord]: Active ORM rows after synchronization.
        """
        existing_query = select(OpenQuestionRecord).where(
            OpenQuestionRecord.session_id == session_id,
            OpenQuestionRecord.stage == stage.value,
        )
        existing = self.db_session.execute(existing_query).scalars().all()
        by_question = {row.question: row for row in existing}
        current_questions = {item.question for item in questions}

        for row in existing:
            if row.question not in current_questions:
                row.status = OpenQuestionStatus.RESOLVED.value
                row.updated_at = _utc_now()

        active_rows: list[OpenQuestionRecord] = []
        for item in questions:
            row = by_question.get(item.question)
            if row is None:
                row = OpenQuestionRecord(
                    id=item.id,
                    session_id=session_id,
                    stage=stage.value,
                    question=item.question,
                    why_it_matters=item.why_it_matters,
                    blocking=item.blocking,
                    status=item.status.value,
                )
                self.db_session.add(row)
            else:
                row.why_it_matters = item.why_it_matters
                row.blocking = item.blocking
                row.status = item.status.value
                row.updated_at = _utc_now()
            active_rows.append(row)

        self.db_session.flush()
        return active_rows

    def list_open(self, session_id: str) -> list[OpenQuestionItem]:
        """List currently open questions for a session.

        Args:
            session_id: Session identifier.

        Returns:
            list[OpenQuestionItem]: Open questions sorted by update time.
        """
        query = (
            select(OpenQuestionRecord)
            .where(
                OpenQuestionRecord.session_id == session_id,
                OpenQuestionRecord.status == OpenQuestionStatus.OPEN.value,
            )
            .order_by(OpenQuestionRecord.updated_at.asc())
        )
        rows = self.db_session.execute(query).scalars().all()
        return [
            OpenQuestionItem(
                id=row.id,
                question=row.question,
                why_it_matters=row.why_it_matters,
                blocking=row.blocking,
                status=OpenQuestionStatus(row.status),
            )
            for row in rows
        ]
