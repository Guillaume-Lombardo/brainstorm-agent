from __future__ import annotations

import json

import pytest

from brainstorm_agent.core.enums import Stage
from brainstorm_agent.core.models import AssistantAnalysis
from brainstorm_agent.core.stage_contracts import DeliveryFields
from brainstorm_agent.core.validation import validate_stage
from brainstorm_agent.services.delivery import export_backlog_json, export_slice_specs, render_delivery
from brainstorm_agent.services.markdown import MarkdownRenderer
from brainstorm_agent.services.prompt_loader import PromptLoader


def test_exports_and_stage_renderer(delivery_plan):
    fields, previous = delivery_plan
    typed = DeliveryFields.model_validate(fields)
    markdown = render_delivery(typed)
    for text in (
        "Delivery slices",
        "Wave 0: slice-0",
        "Wave 1: reports",
        "Contract matrix",
        "GET /reports",
        "Slice reports",
        "Stub report store",
    ):
        assert text in markdown
    specs = export_slice_specs(typed, previous)
    assert set(specs) == {"slice-0.md", "reports.md"}
    assert "Effective dependencies\n\nslice-0" in specs["reports.md"]
    assert "WHEN export requested" in specs["reports.md"]
    exported = json.loads(export_backlog_json(typed, previous))
    assert exported["waves"] == [["slice-0"], ["reports"]]
    assert exported["slices"][1]["dependencies"] == ["slice-0"]
    assert exported["slices"][1]["wave"] == 1
    analysis = AssistantAnalysis(
        stage=Stage.STAGE_7_DELIVERY_SLICING,
        summary="Plan",
        assistant_message="Ready",
        extracted_fields=typed,
    )
    rendered = MarkdownRenderer(PromptLoader()).render(
        stage=analysis.stage,
        analysis=analysis,
        validation=validate_stage(
            stage=analysis.stage,
            extracted_fields=fields,
            previous_fields=previous,
            open_questions=[],
        ),
    )
    assert markdown in rendered
    assert "### Facts" in rendered


def test_incomplete_plan_renders_but_cannot_export(delivery_plan):
    fields, previous = delivery_plan
    fields["slices"][0]["dependencies"] = ["reports"]
    typed = DeliveryFields.model_validate(fields)
    assert "Unavailable" in render_delivery(typed)
    for export in (export_slice_specs, export_backlog_json):
        with pytest.raises(ValueError, match="not ready"):
            export(typed, previous)
    assert "Delivery slices" in render_delivery(DeliveryFields())
