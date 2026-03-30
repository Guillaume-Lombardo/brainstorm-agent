"""Utilities to load externalized prompts."""

from __future__ import annotations

from typing import TYPE_CHECKING

from brainstorm_agent.core.enums import Stage

if TYPE_CHECKING:
    from pathlib import Path


class PromptLoader:
    """Load versioned prompt assets from disk."""

    def __init__(self, *, base_path: Path, version: str = "v1") -> None:
        """Initialize the prompt loader.

        Args:
            base_path: Root prompt directory.
            version: Prompt version folder to load.
        """
        self.base_path = base_path
        self.version = version

    def _read(self, relative_path: str) -> str:
        prompt_path = self.base_path / self.version / relative_path
        return prompt_path.read_text(encoding="utf-8")

    def system_prompt(self) -> str:
        """Return the system prompt.

        Returns:
            str: Global system prompt text.
        """
        return self._read("system.md")

    def stage_prompt(self, stage: Stage) -> str:
        """Return the prompt for one stage.

        Args:
            stage: Stage to load.

        Returns:
            str: Stage-specific prompt text.
        """
        stage_map = {
            Stage.STAGE_0_PITCH: "stages/stage-0-pitch.md",
            Stage.STAGE_1_PROBLEM_FRAMING: "stages/stage-1-problem-framing.md",
            Stage.STAGE_2_USER_STORY_MAPPING: "stages/stage-2-user-story-mapping.md",
            Stage.STAGE_3_EVENT_STORMING: "stages/stage-3-event-storming.md",
            Stage.STAGE_4_IMPACT_MAPPING: "stages/stage-4-impact-mapping.md",
            Stage.STAGE_5_RISK_STORMING: "stages/stage-5-risk-storming.md",
            Stage.STAGE_6_BACKLOG_SYNTHESIS: "stages/stage-6-backlog-synthesis.md",
        }
        return self._read(stage_map[stage])

    def completeness_prompt(self) -> str:
        """Return the completeness evaluation prompt.

        Returns:
            str: Completeness prompt text.
        """
        return self._read("evaluation/completeness.md")

    def contradiction_prompt(self) -> str:
        """Return the contradiction challenge prompt.

        Returns:
            str: Contradiction challenge prompt text.
        """
        return self._read("evaluation/contradiction-challenge.md")

    def markdown_prompt(self) -> str:
        """Return the Markdown rendering prompt.

        Returns:
            str: Rendering prompt text.
        """
        return self._read("rendering/step-markdown.md")
