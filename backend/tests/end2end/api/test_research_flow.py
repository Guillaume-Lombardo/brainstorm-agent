"""Real fake-mode research through stage 2 context."""

import asyncio
from pathlib import Path  # noqa: TC003
from unittest.mock import AsyncMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from brainstorm_agent.core.enums import LLMMode, Stage
from brainstorm_agent.core.models import StageState
from brainstorm_agent.core.research import FeatureSelection
from brainstorm_agent.persistence.base import Base
from brainstorm_agent.services.search import SearchProviderName
from brainstorm_agent.services.session_service import SessionService
from brainstorm_agent.settings import Settings


def test_selected_candidates_reach_stage_two(tmp_path: Path) -> None:
    settings = Settings(
        llm_mode=LLMMode.FAKE,
        search_provider=SearchProviderName.FAKE,
        database_url=f"sqlite:///{tmp_path / 'flow.db'}",
    )
    engine = create_engine(settings.database_url)
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        service = SessionService(db_session=db, settings=settings)
        sid = service.create_session().session_id
        record = service.sessions.get(sid)
        assert record is not None
        state = service.sessions.to_state(record)
        state.current_stage = Stage.STAGE_1_PROBLEM_FRAMING
        state.stage_states[state.current_stage.value] = StageState.model_validate({
            "stage": state.current_stage,
            "extracted_fields": {"problem_statement": "Teams cannot structure product discovery"},
        })
        service.sessions.save_state(sid, state)
        db.commit()
        benchmark = asyncio.run(service.research(sid))
        assert not service.benchmark_context(sid)

        service.select_features(
            sid,
            benchmark.id,
            FeatureSelection(selected_ids=[item.id for item in benchmark.synthesis.features]),
        )
        assert service.benchmark_context(sid) == "Shared framing\nMarkdown export"
        assert "## Benchmark" in service.export_markdown(sid)
        assert service.export_json(sid)["benchmarks"]
        record = service.sessions.get(sid)
        assert record is not None
        state = service.sessions.to_state(record)
        state.current_stage = Stage.STAGE_2_USER_STORY_MAPPING
        service.sessions.save_state(sid, state)
        db.commit()
        original = service.llm.analyze
        captured = AsyncMock(wraps=original)
        with patch.object(service.llm, "analyze", captured):
            service.process_user_message(session_id=sid, content="capabilities: Shared framing")
        assert "Shared framing\nMarkdown export" in captured.call_args.kwargs["user_message"]
