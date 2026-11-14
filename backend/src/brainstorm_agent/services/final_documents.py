"""State-only fallback content and deterministic final Markdown rendering."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

from brainstorm_agent.core.enums import Language, OpenQuestionStatus, Stage
from brainstorm_agent.core.final_documents import FinalSection, FinalStageDocument
from brainstorm_agent.core.language import session_language
from brainstorm_agent.core.research import escape_markdown

if TYPE_CHECKING:
    from brainstorm_agent.core.models import BrainstormSessionState, StageState

_FR_LABELS = {
    "pitch_summary": "Présentation du projet",
    "clear_points": "Points établis",
    "ambiguities": "Ambiguïtés",
    "missing_information": "Informations manquantes",
    "problem_statement": "Problème à résoudre",
    "users_actors": "Utilisateurs et acteurs",
    "measurable_objectives": "Objectifs mesurables",
    "constraints": "Contraintes",
    "non_goals": "Hors périmètre",
    "hypotheses": "Hypothèses",
    "initial_risks": "Risques initiaux",
    "five_w_one_h": "Qui, quoi, où, quand, pourquoi et comment",
    "actors_personas": "Acteurs et profils",
    "user_journeys": "Parcours utilisateurs",
    "capabilities": "Capacités",
    "mvp_scope": "Périmètre du MVP",
    "dependencies": "Dépendances",
    "functional_gaps": "Lacunes fonctionnelles",
    "edge_cases": "Cas limites",
    "event_storming_relevant": "Pertinence de l'event storming",
    "domain_events": "Événements métier",
    "commands": "Commandes",
    "actors": "Acteurs",
    "business_rules": "Règles métier",
    "complexity_hotspots": "Points de complexité",
    "aggregates": "Agrégats",
    "not_relevant_reason": "Justification",
    "business_goal": "Objectif métier",
    "influential_actors": "Acteurs influents",
    "expected_behaviors": "Comportements attendus",
    "deliverables": "Livrables",
    "value_hypotheses": "Hypothèses de valeur",
    "risks_by_category": "Risques par catégorie",
    "mvp_user_stories": "Récits utilisateurs du MVP",
    "risk_spikes": "Explorations des risques",
    "cross_cutting_work": "Travaux transversaux",
    "slices": "Tranches de livraison",
    "id": "Référence",
    "statement": "Description",
    "objective": "Objectif",
    "definition_of_done": "Critères de réalisation",
    "link": "Lien",
    "capability": "Capacité",
    "ears_criteria": "Critères EARS",
    "category": "Catégorie",
    "description": "Description",
    "impact": "Impact",
    "probability": "Probabilité",
    "mitigation": "Atténuation",
    "action": "Action",
    "goal": "Objectif",
    "backlog_item_ids": "Éléments du backlog",
    "owned_domain": "Domaine pris en charge",
    "provided_contracts": "Contrats fournis",
    "consumed_contracts": "Contrats consommés",
    "integration_scenarios": "Scénarios d'intégration",
    "stubs": "Simulations",
    "specification": "Spécification",
    "given": "Étant donné",
    "when": "Quand",
    "then": "Alors",
    "ears": "EARS",
}
_FR_STAGES = (
    "Présentation initiale",
    "Cadrage du problème et 5W1H",
    "Cartographie des récits utilisateurs",
    "Event storming",
    "Cartographie des impacts",
    "Risques et pré-mortem",
    "Synthèse du backlog",
    "Découpage de la livraison",
)
_GOVERNANCE = {
    Language.EN: ("Facts", "Assumptions", "Decisions", "Risks", "Open Questions"),
    Language.FR: ("Faits", "Hypothèses", "Décisions", "Risques", "Questions ouvertes"),
}


def document_language(state: BrainstormSessionState) -> Language:
    """Detect the session language even when transcript retention is disabled.

    Args:
        state (BrainstormSessionState): Session with bounded transcript and business state.

    Returns:
        Language: Latest user language, falling back to persisted business content.
    """
    business_text = json.dumps(
        {
            key: item.extracted_fields.model_dump(exclude_none=True)
            for key, item in state.stage_states.items()
        },
        ensure_ascii=False,
    )
    return session_language("", state.transcript or [{"role": "user", "content": business_text}])


def _label(name: str, language: Language) -> str:
    if language == Language.FR and name in _FR_LABELS:
        return _FR_LABELS[name]
    return name.replace("_", " ").capitalize().replace("Mvp", "MVP").replace("ears", "EARS")


def stage_title(stage: Stage, language: Language) -> str:
    """Return the localized stage heading.

    Args:
        stage (Stage): Canonical stage.
        language (Language): Session language.

    Returns:
        str: Human-readable heading without an internal stage identifier.
    """
    index = Stage.ordered().index(stage)
    return f"Étape {index} — {_FR_STAGES[index]}" if language == Language.FR else stage.label


def _values(value: object, language: Language) -> list[str]:
    if isinstance(value, dict):
        return [
            f"{_label(str(key), language)}: {part}"
            for key, child in value.items()
            for part in _values(child, language)
        ]
    if isinstance(value, list):
        return [part for child in value for part in _values(child, language)]
    if value is None or (isinstance(value, str) and not value):
        return []
    if isinstance(value, bool):
        return [("Oui" if value else "Non") if language == Language.FR else ("Yes" if value else "No")]
    return [str(value)]


def from_stage_state(state: StageState, language: Language) -> FinalStageDocument:
    """Build complete clean content without conversational or gate metadata.

    Args:
        state (StageState): Accumulated business content.
        language (Language): Language for headings and empty states.

    Returns:
        FinalStageDocument: Deterministic fallback and source for the bounded rewrite.
    """
    fields = state.extracted_fields.model_dump(exclude_none=True)
    # The fake adapter's facts duplicate typed fields using their raw identifiers.
    duplicates = {f"{name}: {value}" for name, value in fields.items()}
    sections = [
        FinalSection(title=_label(name, language), items=items)
        for name, value in fields.items()
        if (items := _values(value, language))
    ]
    return FinalStageDocument(
        sections=sections
        or [FinalSection(title=stage_title(state.stage, language), items=[_none(language)])],
        facts=[item.statement for item in state.facts if item.statement not in duplicates],
        assumptions=[item.statement for item in state.assumptions],
        decisions=[
            f"{item.statement} ({item.rationale})" if item.rationale else item.statement
            for item in state.decisions
        ],
        risks=["; ".join(_values(item.model_dump(exclude={"id"}), language)) for item in state.risks],
        open_questions=[
            *[item.question for item in state.open_questions if item.status == OpenQuestionStatus.OPEN],
            *[item for item in state.uncertainties if item != "Blocking questions remain unresolved."],
        ],
    )


def _none(language: Language) -> str:
    return "Aucun élément consigné." if language == Language.FR else "None recorded."


def render_final(document: FinalStageDocument, *, stage: Stage, language: Language) -> str:
    """Render validated prose with fixed governance sections and escaped content.

    Args:
        document (FinalStageDocument): Clean content schema.
        stage (Stage): Validated stage.
        language (Language): Session language.

    Returns:
        str: Deterministic Markdown without working metadata.
    """
    lines = [f"## {stage_title(stage, language)}", ""]
    for section in document.sections:
        lines.extend([
            f"### {escape_markdown(section.title)}",
            "",
            *[f"- {escape_markdown(item)}" for item in section.items],
            "",
        ])
    for name, title in zip(
        ("facts", "assumptions", "decisions", "risks", "open_questions"),
        _GOVERNANCE[language],
        strict=True,
    ):
        items = getattr(document, name)
        lines.extend([
            f"### {title}",
            "",
            *[f"- {escape_markdown(item)}" for item in items or [_none(language)]],
            "",
        ])
    return "\n".join(lines).strip() + "\n"
