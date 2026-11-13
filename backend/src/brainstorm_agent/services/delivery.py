"""Pure Markdown and JSON delivery exports for application API callers."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

from brainstorm_agent.core.delivery import DeliverySlice, delivery_checks, delivery_waves, dependency_graph
from brainstorm_agent.core.enums import Stage

if TYPE_CHECKING:
    from brainstorm_agent.core.stage_contracts import DeliveryFields


def _cell(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", "<br>")


def _slice_spec(item: DeliverySlice) -> str:
    scenarios = [
        scenario.ears or f"Given {scenario.given}\nWhen {scenario.when}\nThen {scenario.then}"
        for scenario in item.integration_scenarios
    ]
    return "\n".join([
        f"## Slice {item.id}",
        "",
        f"### Goal\n\n{item.goal}",
        f"### Backlog items\n\n{', '.join(item.backlog_item_ids) or 'None'}",
        f"### Owned domain\n\n{', '.join(item.owned_domain) or 'Cross-cutting foundation'}",
        "### Provided contracts",
        "",
        *[f"- {c.id}: {c.specification}" for c in item.provided_contracts],
        f"### Consumed contracts\n\n{', '.join(item.consumed_contracts) or 'None'}",
        f"### Declared dependencies\n\n{', '.join(item.dependencies) or 'None'}",
        "### Integration scenarios",
        "",
        *scenarios,
        "### Required stubs",
        "",
        *[f"- {stub}" for stub in item.stubs],
    ])


def render_delivery(fields: DeliveryFields) -> str:
    """Render a plan, including incomplete plans during elicitation.

    Args:
        fields (DeliveryFields): Accumulated delivery fields.

    Returns:
        str: Slice table, waves, contract matrix and individual specifications.
    """
    slices = fields.slices or []
    try:
        waves = delivery_waves(slices)
        wave_text = [f"- Wave {index}: {', '.join(wave)}" for index, wave in enumerate(waves)]
    except ValueError as exc:
        wave_text = [f"- Unavailable: {exc}"]
    return "\n".join([
        "### Delivery slices",
        "",
        "| Slice | Goal | Backlog |",
        "| --- | --- | --- |",
        *[f"| {s.id} | {_cell(s.goal)} | {_cell(', '.join(s.backlog_item_ids))} |" for s in slices],
        "",
        "### Delivery waves",
        "",
        *wave_text,
        "",
        "### Contract matrix",
        "",
        "| Contract | Owner | Consumers | Specification |",
        "| --- | --- | --- | --- |",
        *[
            f"| {_cell(c.id)} | {s.id} | {', '.join(x.id for x in slices if c.id in x.consumed_contracts)} | {_cell(c.specification)} |"
            for s in slices
            for c in s.provided_contracts
        ],
        "",
        *[_slice_spec(s) for s in slices],
    ])


def _validated_slices(fields: DeliveryFields, previous: dict[str, Any]) -> list[DeliverySlice]:
    failed = [key for key, passed in delivery_checks(fields.model_dump(), previous).items() if not passed]
    if failed:
        raise ValueError("Delivery plan is not ready: " + ", ".join(failed))
    return fields.slices or []


def export_slice_specs(fields: DeliveryFields, previous: dict[str, Any]) -> dict[str, str]:
    """Export one standalone Markdown artifact per slice of a validated plan.

    Args:
        fields (DeliveryFields): Delivery plan.
        previous (dict[str, Any]): Prior stage fields for authoritative validation.

    Returns:
        dict[str, str]: Safe filenames mapped to Markdown contents.

    Raises:
        ValueError: Plan violates a deterministic delivery rule.
    """  # noqa: DOC502 - propagated domain validation
    slices = _validated_slices(fields, previous)
    graph = dependency_graph(slices)
    waves = delivery_waves(slices)
    return {
        f"{s.id}.md": _slice_spec(s)
        + f"\n\n### Effective dependencies\n\n{', '.join(sorted(graph[s.id])) or 'None'}\n\n### Wave\n\n{next(i for i, wave in enumerate(waves) if s.id in wave)}\n"
        for s in slices
    }


def export_backlog_json(fields: DeliveryFields, previous: dict[str, Any]) -> str:
    """Serialize validated slice assignments, full backlog items, dependencies and waves.

    Args:
        fields (DeliveryFields): Delivery plan.
        previous (dict[str, Any]): Prior stage field snapshots.

    Returns:
        str: JSON artifact for parallel delivery tooling.

    Raises:
        ValueError: Plan violates a deterministic delivery rule.
    """  # noqa: DOC502 - propagated domain validation
    slices = _validated_slices(fields, previous)
    graph = dependency_graph(slices)
    waves = delivery_waves(slices)
    return json.dumps(
        {
            "backlog": previous.get(Stage.STAGE_6_BACKLOG_SYNTHESIS, {}),
            "waves": waves,
            "slices": [
                {
                    **s.model_dump(),
                    "dependencies": sorted(graph[s.id]),
                    "wave": next(i for i, wave in enumerate(waves) if s.id in wave),
                }
                for s in slices
            ],
        },
        ensure_ascii=False,
        indent=2,
    )
