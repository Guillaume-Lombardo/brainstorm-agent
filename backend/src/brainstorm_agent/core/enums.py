"""Core enums for the brainstorming backend."""

from __future__ import annotations

from enum import StrEnum


class Stage(StrEnum):
    """Ordered brainstorming stages."""

    STAGE_0_PITCH = "stage_0_pitch"
    STAGE_1_PROBLEM_FRAMING = "stage_1_problem_framing"
    STAGE_2_USER_STORY_MAPPING = "stage_2_user_story_mapping"
    STAGE_3_EVENT_STORMING = "stage_3_event_storming"
    STAGE_4_IMPACT_MAPPING = "stage_4_impact_mapping"
    STAGE_5_RISK_STORMING = "stage_5_risk_storming"
    STAGE_6_BACKLOG_SYNTHESIS = "stage_6_backlog_synthesis"

    STAGE_7_DELIVERY_SLICING = "stage_7_delivery_slicing"

    @classmethod
    def ordered(cls) -> tuple[Stage, ...]:
        """Return the full ordered workflow.

        Returns:
            tuple[Stage, ...]: Ordered stages from pitch to delivery slicing.
        """
        return (
            cls.STAGE_0_PITCH,
            cls.STAGE_1_PROBLEM_FRAMING,
            cls.STAGE_2_USER_STORY_MAPPING,
            cls.STAGE_3_EVENT_STORMING,
            cls.STAGE_4_IMPACT_MAPPING,
            cls.STAGE_5_RISK_STORMING,
            cls.STAGE_6_BACKLOG_SYNTHESIS,
            cls.STAGE_7_DELIVERY_SLICING,
        )

    def next_stage(self) -> Stage | None:
        """Return the next stage when one exists.

        Returns:
            Stage | None: The next stage, or `None` when already at the end.
        """
        ordered = self.ordered()
        index = ordered.index(self)
        if index + 1 >= len(ordered):
            return None
        return ordered[index + 1]

    @property
    def label(self) -> str:
        """Return a human-readable stage label.

        Returns:
            str: Friendly stage name.
        """
        labels = {
            Stage.STAGE_0_PITCH: "Stage 0 - Initial Pitch",
            Stage.STAGE_1_PROBLEM_FRAMING: "Stage 1 - Problem Framing and 5W1H",
            Stage.STAGE_2_USER_STORY_MAPPING: "Stage 2 - User Story Mapping",
            Stage.STAGE_3_EVENT_STORMING: "Stage 3 - Event Storming",
            Stage.STAGE_4_IMPACT_MAPPING: "Stage 4 - Impact Mapping",
            Stage.STAGE_5_RISK_STORMING: "Stage 5 - Risk Storming and Pre-mortem",
            Stage.STAGE_6_BACKLOG_SYNTHESIS: "Stage 6 - Backlog Synthesis",
            Stage.STAGE_7_DELIVERY_SLICING: "Stage 7 - Delivery Slicing",
        }
        return labels[self]


class Modality(StrEnum):
    """Supported input modalities."""

    TEXT = "text"


class MessageRole(StrEnum):
    """Conversation roles."""

    USER = "user"
    ASSISTANT = "assistant"


class LLMMode(StrEnum):
    """Runtime LLM backends."""

    OPENAI = "openai"
    FAKE = "fake"


class AuthMode(StrEnum):
    """Supported API authentication modes."""

    NONE = "none"
    API_KEY = "api_key"  # pragma: allowlist secret
    JWT = "jwt"
    HYBRID = "hybrid"


class OpenQuestionStatus(StrEnum):
    """Lifecycle for open questions."""

    OPEN = "open"
    RESOLVED = "resolved"


class HumanReviewDecision(StrEnum):
    """Decision taken during optional human review."""

    APPROVED = "approved"
    REJECTED = "rejected"
    REQUEST_CHANGES = "request_changes"


class StructuredOutputMode(StrEnum):
    """Provider output capability."""

    JSON_SCHEMA = "json_schema"
    JSON_OBJECT = "json_object"
    TOOL = "tool"


class ChallengePass(StrEnum):
    """Optional findings-only challenge."""

    OFF = "off"
    FINDINGS = "findings"


class Language(StrEnum):
    """Languages with deterministic gate wording; other languages fall back to English."""

    EN = "en"
    FR = "fr"

    @classmethod
    def from_string(cls, value: str) -> Language:
        """Parse a language tag such as `fr` or `fr-FR`.

        Args:
            value (str): Language tag.

        Returns:
            Language: Matching language, English when unsupported.
        """
        primary = value.strip().lower().replace("_", "-").split("-", maxsplit=1)[0]
        return cls(primary) if primary in cls._value2member_map_ else cls.EN
