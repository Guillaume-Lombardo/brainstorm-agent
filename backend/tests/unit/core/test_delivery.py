from __future__ import annotations

from copy import deepcopy

import pytest

from brainstorm_agent.core.delivery import DeliverySlice, delivery_checks, delivery_waves
from brainstorm_agent.core.enums import Stage
from brainstorm_agent.core.validation import validate_stage


def test_valid_plan_and_capability_fallback(delivery_plan):
    fields, previous = delivery_plan
    assert all(delivery_checks(fields, previous).values())
    result = validate_stage(
        stage=Stage.STAGE_7_DELIVERY_SLICING,
        extracted_fields=fields,
        previous_fields=previous,
        open_questions=[],
    )
    assert result.stage_is_clear_enough
    previous[Stage.STAGE_3_EVENT_STORMING.value] = {"event_storming_relevant": False}
    assert all(delivery_checks(fields, previous).values())
    previous[Stage.STAGE_3_EVENT_STORMING.value] = {"event_storming_relevant": True}
    assert not delivery_checks(fields, previous)["domain_ownership"]


DELIVERY_CASES = [
    (lambda s: s[0].update(dependencies=["reports"]), "acyclic_dependencies"),
    (lambda s: s[1].update(dependencies=["missing"]), "acyclic_dependencies"),
    (lambda s: s[1].update(consumed_contracts=["orphan"]), "contract_ownership"),
    (lambda s: s[1].update(provided_contracts=s[0]["provided_contracts"]), "contract_ownership"),
    (lambda s: s[1].update(backlog_item_ids=[]), "mvp_assignment"),
    (lambda s: s[0]["backlog_item_ids"].append("story"), "mvp_assignment"),
    (lambda s: s[1]["backlog_item_ids"].append("story"), "mvp_assignment"),
    (lambda s: s[1].update(integration_scenarios=[]), "integration_scenarios"),
    (lambda s: s[1].update(integration_scenarios=[{"given": "Only context"}]), "integration_scenarios"),
    (lambda s: s[1].update(integration_scenarios=[{"ears": "Export it"}]), "integration_scenarios"),
    (lambda s: s[1]["backlog_item_ids"].append("foundation"), "cross_cutting_foundation"),
    (lambda s: s[0].update(backlog_item_ids=[]), "cross_cutting_foundation"),
    (lambda s: s[1]["backlog_item_ids"].append("unknown"), "backlog_references"),
    (lambda s: s[1].update(owned_domain=["unknown"]), "domain_ownership"),
    (lambda s: s.pop(0), "walking_skeleton"),
    (lambda s: s.append(deepcopy(s[0])), "acyclic_dependencies"),
]


@pytest.mark.parametrize(("mutation", "rule"), DELIVERY_CASES)
def test_rejects_invalid_delivery_rule(delivery_plan, mutation, rule):
    fields, previous = delivery_plan
    mutation(fields["slices"])
    assert not delivery_checks(fields, previous)[rule]
    assert not validate_stage(
        stage=Stage.STAGE_7_DELIVERY_SLICING,
        extracted_fields=fields,
        previous_fields=previous,
        open_questions=[],
    ).stage_is_clear_enough


def test_waves_include_inferred_contract_edges_and_parallel_slices(delivery_plan):
    fields, _ = delivery_plan
    slices = [DeliverySlice.model_validate(s) for s in fields["slices"]]
    slices.extend([
        slices[1].model_copy(update={"id": "parallel", "consumed_contracts": []}),
        slices[1].model_copy(update={"id": "last", "dependencies": ["reports", "parallel"]}),
    ])
    assert delivery_waves(list(reversed(slices))) == [["slice-0"], ["parallel", "reports"], ["last"]]
    slices[0].dependencies = ["last"]
    with pytest.raises(ValueError, match="acyclic"):
        delivery_waves(slices)
