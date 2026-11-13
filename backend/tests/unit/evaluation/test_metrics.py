import pytest

from brainstorm_agent.core.enums import Stage
from brainstorm_agent.evaluation.metrics import calculate_metrics
from brainstorm_agent.evaluation.models import Observation


def test_confusion_matrix_and_cost():
    observations = [
        Observation(
            stage=Stage.STAGE_0_PITCH,
            expected=expected,
            actual=actual,
            prompt_tokens=10,
            completion_tokens=2,
            latency_seconds=0.5,
        )
        for expected, actual in [(True, True), (False, True), (True, False), (False, False)]
    ]
    observations[2].schema_failure = True
    result = calculate_metrics(observations)
    assert result["transition_precision"] == pytest.approx(0.5)
    assert result["transition_recall"] == pytest.approx(0.5)
    assert result["true_negative"] == 1
    assert result["schema_failures"] == 1
    assert result["prompt_tokens"] == 40
    assert result["completion_tokens"] == 8
    assert result["latency_seconds"] == 2
    assert result["turns_per_stage"] == {"stage_0_pitch": 4}


def test_undefined_metrics_are_null():
    assert calculate_metrics([])["transition_precision"] is None
    assert calculate_metrics([])["transition_recall"] is None
