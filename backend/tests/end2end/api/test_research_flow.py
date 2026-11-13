"""Real fake-mode research through stage 2 context."""

import asyncio
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from brainstorm_agent.core.enums import Stage
from brainstorm_agent.core.models import StageState
from brainstorm_agent.persistence.base import Base
from brainstorm_agent.services.session_service import SessionService
from brainstorm_agent.settings import Settings


def test_selected_candidates_reach_stage_two(tmp_path: Path) -> None:
    settings = Settings(
        llm_mode="fake", search_provider="fake", database_url=f"sqlite:///{tmp_path / 'flow.db'}"
    )
    engine = create_engine(settings.database_url)
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        service = SessionService(db_session=db, settings=settings)
        sid = service.create_session().session_id
        state = service.sessions.to_state(service._require_owned(sid))
        state.current_stage = Stage.STAGE_1_PROBLEM_FRAMING
        state.stage_states[state.current_stage.value] = StageState(
            stage=state.current_stage,
            extracted_fields={"problem_statement": "Teams cannot structure product discovery"},
        )
        service.sessions.save_state(sid, state)
        db.commit()
        benchmark = asyncio.run(service.research(sid))
        assert service.benchmark_context(sid) == ""
        from brainstorm_agent.core.research import FeatureSelection

        service.select_features(
            sid,
            benchmark.id,
            FeatureSelection(selected_ids=[item.id for item in benchmark.synthesis.features]),
        )
        assert service.benchmark_context(sid) == "Shared framing\nMarkdown export"
        assert "## Benchmark" in service.export_markdown(sid)
        assert service.export_json(sid)["benchmarks"]
