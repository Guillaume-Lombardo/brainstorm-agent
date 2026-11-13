from __future__ import annotations

from brainstorm_agent.core.enums import LLMMode, Stage
from brainstorm_agent.core.models import AssistantAnalysis, FactItem, OpenQuestionItem
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


def test_every_stage_accumulates_multiple_free_form_turns(tmp_path):  # noqa: C901 - full workflow fixture
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
            if stage is Stage.STAGE_0_PITCH:
                fields["pitch_summary"] = "A tool to export monthly reports"
            if stage is Stage.STAGE_1_PROBLEM_FRAMING:
                fields["measurable_objectives"] = ["Reduce delay by 20 percent"]
            if stage is Stage.STAGE_3_EVENT_STORMING:
                fields = {"event_storming_relevant": False, "not_relevant_reason": "No domain event workflow"}
            if stage is Stage.STAGE_5_RISK_STORMING:
                fields = {
                    "risks_by_category": [
                        {
                            "id": f"risk-{i}",
                            "category": "technical" if i % 2 else "business",
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
                    name: [
                        {
                            "id": name,
                            "statement": "Deliver validated scope",
                            "objective": "Reduce delay",
                            "definition_of_done": "Delay measured",
                            "link": "risk-0",
                            "capability": "Confirmed answer",
                        },
                    ]
                    for name in contract.required_fields
                }
            if stage is Stage.STAGE_7_DELIVERY_SLICING:
                fields = {
                    "slices": [
                        {
                            "id": "slice-0",
                            "goal": "Walking skeleton and report export",
                            "backlog_item_ids": ["mvp_user_stories", "risk_spikes", "cross_cutting_work"],
                            "integration_scenarios": [
                                {"ears": "WHEN export requested THE SYSTEM SHALL return reports"},
                            ],
                        },
                    ],
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
                            "category": "technical" if i % 2 else "business",
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
            if stage is not Stage.STAGE_7_DELIVERY_SLICING:
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
        assert len(service.list_documents(session_id)) == 16
        assert len(service.list_messages(session_id)) == 33


def test_vague_pitch_blocks_until_clarification_and_logs_answer(tmp_path):

    settings = Settings(llm_mode=LLMMode.FAKE, database_url=f"sqlite+pysqlite:///{tmp_path / 'vague.db'}")
    engine = create_engine_from_settings(settings)
    create_all(engine)
    fake = FakeBrainstormLLM(prompt_loader=PromptLoader())
    fake.scripted_responses.append(
        AssistantAnalysis(
            summary="Vague",
            assistant_message="Who uses this?",
            extracted_fields=STAGE_MODELS[Stage.STAGE_0_PITCH].model_validate({
                "pitch_summary": "app",
                "clear_points": ["Reports"],
                "ambiguities": ["Users"],
                "missing_information": ["Frequency"],
            }),
            open_questions=[OpenQuestionItem(id="q1", question="Who uses this?")],
        ),
    )
    with create_session_factory(engine)() as db:
        service = SessionService(db_session=db, settings=settings, llm=fake)
        session_id = service.create_session().session_id
        first = service.process_user_message(session_id=session_id, content="An app")
        assert not first.stage_clear_enough
        question_id = first.open_questions[0].id
        fake.scripted_responses.append(
            AssistantAnalysis(
                summary="Clarified",
                assistant_message="Thanks",
                extracted_fields=STAGE_MODELS[Stage.STAGE_0_PITCH].model_validate({
                    "pitch_summary": "Accountants export monthly tax reports for clients",
                }),
                resolved_question_ids=[question_id],
            ),
        )
        second = service.process_user_message(
            session_id=session_id,
            content="Accountants export monthly tax reports for clients",
        )
        assert second.stage_clear_enough
        assert second.next_stage is Stage.STAGE_1_PROBLEM_FRAMING
        assert "### Clarifications" in second.step_markdown
        assert "Who uses this? -> Accountants" in second.step_markdown
        assert "passed/total" in second.step_markdown
        assert len(service.list_documents(session_id)) == 2
        state = service.sessions.to_state(service.sessions.require(session_id))
        assert state.stage_states[Stage.STAGE_0_PITCH].clarifications[0].question_id == question_id
