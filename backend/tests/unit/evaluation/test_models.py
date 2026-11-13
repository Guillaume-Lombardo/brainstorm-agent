import pytest
from pydantic import ValidationError

from brainstorm_agent.evaluation.models import Scenario, load_scenarios
from brainstorm_agent.evaluation.runner import default_scenarios


def test_packaged_corpus():
    scenarios = load_scenarios(default_scenarios())
    assert len(scenarios) == 4
    assert sum(s.must_complete for s in scenarios) == 2
    assert any(t.contradiction for s in scenarios for t in s.turns)


def test_empty_and_duplicate_corpus(tmp_path):
    with pytest.raises(ValueError, match="unique ids"):
        load_scenarios(tmp_path)
    source = next(default_scenarios().glob("*.yaml")).read_text()
    (tmp_path / "one.yaml").write_text(source)
    (tmp_path / "two.yaml").write_text(source)
    with pytest.raises(ValueError, match="unique ids"):
        load_scenarios(tmp_path)


def test_invalid_stage_and_unknown_fields():
    payload = load_scenarios(default_scenarios())[0].model_dump(mode="json")
    payload["turns"][0]["stage"] = "stage_8_magic"
    with pytest.raises(ValidationError):
        Scenario.model_validate(payload)
    payload["turns"][0]["stage"] = "stage_0_pitch"
    payload["typo"] = True
    with pytest.raises(ValidationError):
        Scenario.model_validate(payload)
