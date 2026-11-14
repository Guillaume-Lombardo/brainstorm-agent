"""State-only fallback content and deterministic final Markdown rendering."""

from __future__ import annotations

import json
import re
import unicodedata
from typing import TYPE_CHECKING

from brainstorm_agent.core.enums import Language, OpenQuestionStatus, Stage
from brainstorm_agent.core.final_documents import FinalSection, FinalStageDocument
from brainstorm_agent.core.language import session_language

if TYPE_CHECKING:
    from brainstorm_agent.core.models import BrainstormSessionState, StageState

_FR_LABELS = {
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
        return [
            part
            for child in value
            for part in (
                ["; ".join(_values(child, language))] if isinstance(child, dict) else _values(child, language)
            )
            if part
        ]
    if value is None or (isinstance(value, str) and not value):
        return []
    if isinstance(value, bool):
        return [("Oui" if value else "Non") if language == Language.FR else ("Yes" if value else "No")]
    return [str(value)]


_FIELD_GOVERNANCE = {
    "clear_points": "facts",
    "ambiguities": "open_questions",
    "missing_information": "open_questions",
    "users_actors": "facts",
    "measurable_objectives": "facts",
    "constraints": "facts",
    "non_goals": "decisions",
    "hypotheses": "assumptions",
    "initial_risks": "risks",
    "value_hypotheses": "assumptions",
}
_RISK_PREFIX = re.compile(
    r"^(?:(?:main |initial )?risk(?: identified)?|risque(?: principal| initial)?(?: identifié)?)\s*:\s*",
    re.IGNORECASE,
)


def _identity(text: str) -> str:
    """Normalize presentation differences without merging distinct business values.

    Args:
        text (str): Business statement, optionally with an explicit risk prefix.

    Returns:
        str: Comparable key preserving internal punctuation and numeric values.
    """
    # Normalize presentation only; preserve numbers, operators and business distinctions.
    text = unicodedata.normalize("NFKC", _RISK_PREFIX.sub("", text)).casefold()
    text = text.replace("\u2019", "'").replace("\u2013", "-").replace("\u2010", "-")
    text = re.sub(r"\s+([.,?!:;])", r"\1", " ".join(text.split()))
    return text.strip().rstrip(".?!")


def _deduplicate(
    document: FinalStageDocument,
    language: Language,
    aliases: dict[str, list[str]] | None = None,
) -> FinalStageDocument:
    """Assign repeated statements to their most specific existing section.

    Args:
        document (FinalStageDocument): Unescaped business content.
        language (Language): Language for a neutral overview when none remains.
        aliases (dict[str, list[str]] | None): Bare statements covered by richer records.

    Returns:
        FinalStageDocument: Deduplicated content with overview overflow kept in facts.
    """
    seen: set[str] = set()

    def unique(items: list[str], covered: set[str] | None = None) -> list[str]:
        """Keep statements not covered by a previously emitted item.

        Args:
            items (list[str]): Ordered candidate statements.
            covered (set[str] | None): Keys to check against; the global set by default.

        Returns:
            list[str]: First occurrence of each new statement.
        """
        scope = seen if covered is None else covered
        result = []
        for item in items:
            key = _identity(item)
            if key and key not in scope:
                scope.add(key)
                scope.update(_identity(alias) for alias in (aliases or {}).get(key, []))
                result.append(" ".join(item.split()))
        return result

    # Specific governance wins over generic facts; artefacts retain their relationships.
    governance = {
        name: unique(getattr(document, name))
        for name in ("risks", "open_questions", "assumptions", "decisions")
    }
    # Each section keeps its own membership; later facts still dedupe against all sections.
    section_keys: set[str] = set()
    sections = []
    for section in document.sections:
        local = set(seen)
        if items := unique(section.items, local):
            sections.append(section.model_copy(update={"items": items}))
            section_keys |= local
    seen |= section_keys
    overview = unique(re.split(r"(?<=[.!?])\s+(?=[A-ZÀ-Þ])", document.overview))
    seen.add(_identity(document.overview))
    facts = [*overview[4:], *unique(document.facts)]
    return document.model_copy(
        update={
            "overview": " ".join(overview[:4]) or _overview(language),
            "sections": sections,
            "facts": facts,
            **governance,
        },
    )


def from_stage_state(state: StageState, language: Language) -> FinalStageDocument:
    """Build content once, routing governance fields to their specific lists.

    Args:
        state (StageState): Accumulated business content.
        language (Language): Language for headings and empty states.

    Returns:
        FinalStageDocument: Deduplicated fallback and source for the bounded rewrite.
    """
    fields = state.extracted_fields.model_dump(exclude_none=True)
    duplicates = {_identity(f"{name}: {value}") for name, value in fields.items()}
    overview = str(
        fields.pop("pitch_summary", None) or fields.pop("problem_statement", None) or _overview(language),
    )
    governance: dict[str, list[str]] = {
        "facts": [],
        "assumptions": [item.statement for item in state.assumptions],
        "decisions": [
            f"{item.statement} ({item.rationale})" if item.rationale else item.statement
            for item in state.decisions
        ],
        "risks": ["; ".join(_values(item.model_dump(exclude={"id"}), language)) for item in state.risks],
        "open_questions": [
            *[item.question for item in state.open_questions if item.status == OpenQuestionStatus.OPEN],
            *[item for item in state.uncertainties if item != "Blocking questions remain unresolved."],
        ],
    }
    aliases = {
        _identity(text): [item.description]
        for text, item in zip(governance["risks"], state.risks, strict=True)
    }
    aliases.update({
        _identity(text): [item.statement]
        for text, item in zip(governance["decisions"], state.decisions, strict=True)
    })
    field_risks = fields.pop("risks_by_category", [])
    if isinstance(field_risks, list):
        records = []
        for risk in field_risks:
            text = "; ".join(_values(risk, language))
            records.append(text)
            if isinstance(risk, dict):
                aliases[_identity(text)] = [
                    str(risk.get("description", "")),
                    "; ".join(_values({key: value for key, value in risk.items() if key != "id"}, language)),
                ]
        governance["risks"] = [*records, *governance["risks"]]
    sections = []
    for name, value in fields.items():
        items = _values(value, language)
        if name in _FIELD_GOVERNANCE:
            governance[_FIELD_GOVERNANCE[name]].extend(items)
        elif items:
            sections.append(FinalSection(title=_label(name, language), items=items))
    governance["facts"].extend(
        item.statement for item in state.facts if _identity(item.statement) not in duplicates
    )
    facts = []
    for item in governance["facts"]:
        if _RISK_PREFIX.match(item):
            governance["risks"].append(_RISK_PREFIX.sub("", item))
        else:
            facts.append(item)
    return _deduplicate(
        FinalStageDocument(
            overview=overview,
            sections=sections,
            facts=facts,
            assumptions=governance["assumptions"],
            decisions=governance["decisions"],
            risks=governance["risks"],
            open_questions=governance["open_questions"],
        ),
        language,
        aliases,
    )


def escape_final_markdown(text: str) -> str:
    """Keep untrusted final content literal while preserving ordinary punctuation.

    Args:
        text (str): One untrusted prose item, title or overview.

    Returns:
        str: Single-line Markdown with inert syntax, URLs and email addresses.
    """
    text = " ".join(text.split()).replace("&", "&amp;")
    text = re.sub(r"([\\`*_\[\]<>|~])", r"\\\1", text)
    text = re.sub(r"^(\s*)([#\-+])", r"\1\\\2", text)
    text = re.sub(r"^(\s*\d+)\.", r"\1\\.", text)
    # GFM scans decoded text too: an invisible separator must survive entity decoding.
    text = re.sub(
        r"(?i)\b(https?|ftp):",
        lambda match: f"{match[1][0]}&#8203;{match[1][1:]}:",
        text,
    )
    text = re.sub(r"(?i)\b(w)(ww\.)", r"\1&#8203;\2", text)
    return text.replace("@", "@&#8203;")


def _overview(language: Language) -> str:
    """Provide neutral prose without inventing business content.

    Args:
        language (Language): Session language.

    Returns:
        str: Two-sentence introduction for stages without a pitch or problem statement.
    """
    return (
        "Cette étape consigne les éléments de cadrage validés. Les détails figurent ci-dessous."
        if language == Language.FR
        else "This stage records the validated framing content. Details follow below."
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
    document = _deduplicate(document, language)
    lines = [f"## {stage_title(stage, language)}", "", escape_final_markdown(document.overview), ""]
    for section in document.sections:
        lines.extend([
            f"### {escape_final_markdown(section.title)}",
            "",
            *[f"- {escape_final_markdown(item)}" for item in section.items],
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
            *[f"- {escape_final_markdown(item)}" for item in items or [_none(language)]],
            "",
        ])
    return "\n".join(lines).strip() + "\n"
