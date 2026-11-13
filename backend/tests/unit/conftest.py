from __future__ import annotations

import pytest

from brainstorm_agent.core.enums import Stage


@pytest.fixture
def delivery_plan():
    fields = {
        "slices": [
            {
                "id": "slice-0",
                "goal": "Walking skeleton",
                "backlog_item_ids": ["foundation"],
                "provided_contracts": [{"id": "api", "specification": "GET /reports returns report ids"}],
                "integration_scenarios": [
                    {"given": "Service running", "when": "Health requested", "then": "Returns ready"},
                ],
            },
            {
                "id": "reports",
                "goal": "Export reports",
                "backlog_item_ids": ["story"],
                "owned_domain": ["Reporting"],
                "consumed_contracts": ["api"],
                "integration_scenarios": [{"ears": "WHEN export requested THE SYSTEM SHALL return a CSV"}],
                "stubs": ["Stub report store"],
            },
        ],
    }
    previous = {
        Stage.STAGE_2_USER_STORY_MAPPING.value: {"capabilities": ["Reporting"]},
        Stage.STAGE_3_EVENT_STORMING.value: {"event_storming_relevant": True, "aggregates": ["Reporting"]},
        Stage.STAGE_6_BACKLOG_SYNTHESIS.value: {
            "mvp_user_stories": [{"id": "story"}],
            "cross_cutting_work": [{"id": "foundation"}],
        },
    }
    return fields, previous
