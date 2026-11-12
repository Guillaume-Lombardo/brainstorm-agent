from __future__ import annotations

from brainstorm_agent.core.enums import LLMMode, Stage
from brainstorm_agent.core.models import AssistantAnalysis, FactItem
from brainstorm_agent.core.stage_contracts import STAGE_CONTRACTS, STAGE_MODELS
from brainstorm_agent.persistence.session import (
    create_all,
    create_engine_from_settings,
    create_session_factory,
)
from brainstorm_agent.services.llm_client import FakeBrainstormLLM
from brainstorm_agent.services.prompt_loader import PromptLoader
from brainstorm_agent.services.session_service import SessionService
from brainstorm_agent.settings import Settings


def test_every_stage_accumulates_multiple_free_form_turns(tmp_path):
    settings = Settings(llm_mode=LLMMode.FAKE, database_url=f"sqlite+pysqlite:///{tmp_path / 'loop.db'}")
    engine = create_engine_from_settings(settings)
    create_all(engine)
    fake = FakeBrainstormLLM(prompt_loader=PromptLoader())
    with create_session_factory(engine)() as db:
        service = SessionService(db_session=db, settings=settings, llm=fake)
        session_id = service.create_session().session_id
        for stage in Stage.ordered():
            fields = {}
            contract = STAGE_CONTRACTS[stage]
            for name in contract.required_fields:
                fields[name] = ["Confirmed answer"] if name in contract.list_fields else "Confirmed answer"
            if stage is Stage.STAGE_3_EVENT_STORMING:
                fields = {"event_storming_relevant": False, "not_relevant_reason": "No domain event workflow"}
            if stage is Stage.STAGE_5_RISK_STORMING:
                fields = {
                    "risks_by_category": [
                        {
                            "id": f"risk-{i}",
                            "category": "technical",
                            "description": "Data loss",
                            "impact": "high",
                            "probability": "low",
                            "mitigation": "Backup",
                            "action": "Restore drill",
                        }
                        for i in range(3)
                    ],
                }
            if stage is Stage.STAGE_6_BACKLOG_SYNTHESIS:
                fields = {
                    name: [{"id": name, "statement": "Deliver validated scope"}]
                    for name in contract.required_fields
                }
            first_name = next(iter(fields))
            initial_fields = {first_name: fields.pop(first_name)}
            if stage is Stage.STAGE_5_RISK_STORMING:
                risk_list = initial_fields["risks_by_category"]
                assert isinstance(risk_list, list)
                initial_fields = {"risks_by_category": risk_list[:1]}
                fields = {
                    "risks_by_category": [
                        {
                            "id": f"risk-{i}",
                            "category": "technical",
                            "description": "Data loss",
                            "impact": "high",
                            "probability": "low",
                            "mitigation": "Backup",
                            "action": "Restore drill",
                        }
                        for i in range(1, 3)
                    ],
                }
            fake.scripted_responses.extend([
                AssistantAnalysis(
                    stage=stage,
                    summary="Premier détail",
                    assistant_message="Précisez",
                    facts=[FactItem(id="stable", statement="Confirmed")],
                    extracted_fields=STAGE_MODELS[stage].model_validate(initial_fields),
                ),
                AssistantAnalysis(
                    stage=stage,
                    summary="Étape documentée",
                    assistant_message="Merci",
                    extracted_fields=STAGE_MODELS[stage].model_validate(fields),
                ),
            ])
            first = service.process_user_message(session_id=session_id, content="Voici mon contexte initial")
            assert not first.stage_clear_enough
            second = service.process_user_message(
                session_id=session_id,
                content="Voici les réponses aux questions",
            )
            assert second.stage_clear_enough
            assert second.facts[0].id == "stable"
            assert (
                service.sessions
                .to_state(service.sessions.require(session_id))
                .stage_states[stage]
                .extracted_fields.model_dump(exclude_none=True)
            )
        assert len(service.list_documents(session_id)) == 14
        assert len(service.list_messages(session_id)) == 29
