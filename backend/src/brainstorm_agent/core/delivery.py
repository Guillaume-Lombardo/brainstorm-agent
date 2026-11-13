"""Typed delivery contracts and deterministic dependency planning."""

from __future__ import annotations

import re
from collections import Counter
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from brainstorm_agent.core.enums import Stage


class IntegrationScenario(BaseModel):
    """An executable integration example in GWT or EARS form."""

    model_config = ConfigDict(extra="forbid")
    given: str = ""
    when: str = ""
    then: str = ""
    ears: str | None = None

    def is_complete(self) -> bool:
        """Check the chosen scenario syntax.

        Returns:
            bool: True for a complete GWT example or EARS criterion.
        """
        return bool(
            all(value.strip() for value in (self.given, self.when, self.then))
            or (self.ears and re.fullmatch(r"WHEN .+ THE SYSTEM SHALL .+", self.ears)),
        )


class DeliveryContract(BaseModel):
    """Shared interface with a stable identifier and concrete specification."""

    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1)
    specification: str = Field(min_length=1)


class DeliverySlice(BaseModel):
    """One independently developable delivery unit; slice-0 is the foundation."""

    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    goal: str = Field(min_length=1)
    backlog_item_ids: list[str] = Field(default_factory=list)
    owned_domain: list[str] = Field(default_factory=list)
    provided_contracts: list[DeliveryContract] = Field(default_factory=list)
    consumed_contracts: list[str] = Field(default_factory=list)
    dependencies: list[str] = Field(default_factory=list)
    integration_scenarios: list[IntegrationScenario] = Field(default_factory=list)
    stubs: list[str] = Field(default_factory=list)


def _contract_owners(slices: list[DeliverySlice]) -> dict[str, str]:
    owners: dict[str, str] = {}
    for item in slices:
        for contract in item.provided_contracts:
            if contract.id in owners:
                raise ValueError("Each contract must have exactly one owner.")  # noqa: TRY003 - actionable domain rejection
            owners[contract.id] = item.id
    return owners


def dependency_graph(slices: list[DeliverySlice]) -> dict[str, set[str]]:
    """Derive prerequisites from explicit dependencies, contract owners and slice 0.

    Args:
        slices (list[DeliverySlice]): Complete slice collection.

    Returns:
        dict[str, set[str]]: Slice id to prerequisite ids.

    Raises:
        ValueError: Duplicate ids, unknown dependencies or invalid contract ownership.
    """
    graph = {s.id: set(s.dependencies) for s in slices}
    if len(graph) != len(slices):
        raise ValueError("Slice ids must be unique.")  # noqa: TRY003 - actionable domain rejection
    owners = _contract_owners(slices)
    for item in slices:
        if item.id != "slice-0" and "slice-0" in graph:
            graph[item.id].add("slice-0")
        for contract in item.consumed_contracts:
            if contract not in owners:
                raise ValueError("Consumed contract has no owner.")  # noqa: TRY003 - actionable domain rejection
            if owners[contract] != item.id:
                graph[item.id].add(owners[contract])
        if not graph[item.id] <= graph.keys():
            raise ValueError("Unknown slice dependency.")  # noqa: TRY003 - actionable domain rejection
    return graph


def delivery_waves(slices: list[DeliverySlice]) -> list[list[str]]:
    """Topologically group slices into deterministic parallel delivery waves.

    Args:
        slices (list[DeliverySlice]): Complete slice collection.

    Returns:
        list[list[str]]: Sorted slice ids per wave, starting at wave zero.

    Raises:
        ValueError: Invalid graph or cycle.
    """
    graph = dependency_graph(slices)
    waves: list[list[str]] = []
    while graph:
        ready = sorted(key for key, dependencies in graph.items() if not dependencies)
        if not ready:
            raise ValueError("Slice dependencies must be acyclic.")  # noqa: TRY003 - actionable domain rejection
        waves.append(ready)
        graph = {key: dependencies - set(ready) for key, dependencies in graph.items() if key not in ready}
    return waves


def delivery_checks(fields: dict[str, Any], previous: dict[str, Any]) -> dict[str, bool]:
    """Evaluate stage 7 invariants using prior typed stage snapshots.

    Args:
        fields (dict[str, Any]): Serialized delivery fields.
        previous (dict[str, Any]): Stage-keyed prior fields.

    Returns:
        dict[str, bool]: Stable declarative rule ids and outcomes.
    """
    slices = [DeliverySlice.model_validate(s) for s in fields.get("slices") or []]
    backlog = previous.get(Stage.STAGE_6_BACKLOG_SYNTHESIS, {})
    items = [
        item
        for name in ("mvp_user_stories", "risk_spikes", "cross_cutting_work")
        for item in backlog.get(name) or []
    ]
    mvp = {item["id"] for item in backlog.get("mvp_user_stories") or []}
    transverse = {item["id"] for item in backlog.get("cross_cutting_work") or []}
    counts = Counter(key for s in slices for key in s.backlog_item_ids)
    event = previous.get(Stage.STAGE_3_EVENT_STORMING, {})
    domains = (
        previous.get(Stage.STAGE_2_USER_STORY_MAPPING, {}).get("capabilities") or []
        if event.get("event_storming_relevant") is False
        else event.get("aggregates") or []
    )
    owned = [domain for s in slices if s.id != "slice-0" for domain in s.owned_domain]
    try:
        dependency_graph(slices)
        contracts_valid = True
    except ValueError:
        contracts_valid = False
    try:
        delivery_waves(slices)
        graph_valid = True
    except ValueError:
        graph_valid = False
    return {
        "walking_skeleton": sum(s.id == "slice-0" for s in slices) == 1,
        "mvp_assignment": bool(mvp) and all(counts[key] == 1 for key in mvp),
        "backlog_references": set(counts) <= {item["id"] for item in items},
        "acyclic_dependencies": graph_valid,
        "contract_ownership": contracts_valid,
        "integration_scenarios": bool(slices)
        and all(
            s.integration_scenarios and all(x.is_complete() for x in s.integration_scenarios) for s in slices
        ),
        "cross_cutting_foundation": all(counts[key] == 1 for key in transverse)
        and all(not transverse.intersection(s.backlog_item_ids) for s in slices if s.id != "slice-0"),
        "domain_ownership": len(owned) == len(set(owned))
        and all(domain in domains for domain in owned)
        and all(s.owned_domain for s in slices if s.id != "slice-0"),
    }
