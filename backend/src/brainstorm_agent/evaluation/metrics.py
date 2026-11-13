"""Deterministic micro-averaged transition metrics."""

from __future__ import annotations

from collections import Counter
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from brainstorm_agent.evaluation.models import Observation


def calculate_metrics(observations: list[Observation]) -> dict[str, object]:
    """Calculate gate metrics; undefined precision or recall is null.

    Stage 7 acceptance counts as advancement (workflow completion).
    Failed attempts count as non-advancement and remain in the denominator.

    Args:
        observations (list[Observation]): Attempted oracle checkpoints.

    Returns:
        dict[str, object]: Counts, precision/recall, usage and latency.
    """
    actor_failures = sum(len(item.actor_errors) for item in observations)
    observations = [item for item in observations if item.target_attempted]
    tp = sum(item.expected and item.actual for item in observations)
    fp = sum(not item.expected and item.actual for item in observations)
    fn = sum(item.expected and not item.actual for item in observations)
    return {
        "actor_failures": actor_failures,
        "true_positive": tp,
        "false_positive": fp,
        "false_negative": fn,
        "true_negative": sum(not item.expected and not item.actual for item in observations),
        "transition_precision": tp / (tp + fp) if tp + fp else None,
        "transition_recall": tp / (tp + fn) if tp + fn else None,
        "turns_per_stage": dict(Counter(item.stage.value for item in observations)),
        "schema_failures": sum(item.schema_failure for item in observations),
        "latency_seconds": sum(item.latency_seconds for item in observations),
        "prompt_tokens": sum(item.prompt_tokens for item in observations),
        "completion_tokens": sum(item.completion_tokens for item in observations),
    }
