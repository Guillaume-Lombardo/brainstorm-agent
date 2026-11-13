"""Deterministic, localized wording for the questions raised by the coded stage gate.

The gate decision stays in `core/validation.py`; this module only phrases each failed
requirement as a question a user can answer, in the session language (decision D3).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING
from uuid import uuid4

from brainstorm_agent.core.enums import Language, OpenQuestionStatus
from brainstorm_agent.core.models import CoverageStatus, OpenQuestionItem

if TYPE_CHECKING:
    from brainstorm_agent.core.models import StageValidationResult

type Localized = dict[Language, str]
type LocalizedOptions = dict[Language, tuple[str, ...]]

GATE_ID_PREFIX = "gate:"
# `gate:` + 31 hex characters fits the 36-character `open_questions.id` column.
GATE_ID_HEX_LENGTH = 31


def _text(en: str, fr: str) -> Localized:
    return {Language.EN: en, Language.FR: fr}


def _options(en: tuple[str, ...], fr: tuple[str, ...]) -> LocalizedOptions:
    return {Language.EN: en, Language.FR: fr}


# Answers that move any requirement forward without inventing business facts; the first is
# recommended because the user picks from concrete proposals instead of starting from scratch.
DEFAULT_OPTIONS = _options(
    (
        "Suggest a few answers I can choose from",
        "Ask me a simpler question about it",
        "Not decided yet: note it as an assumption to confirm",
    ),
    (
        "Propose-moi quelques réponses à choisir",
        "Pose-moi une question plus simple à ce sujet",
        "Pas encore décidé : note-le comme hypothèse à confirmer",
    ),
)
MISSING_WHY = _text(
    "Needed before this stage can be validated.",
    "Nécessaire pour valider cette étape.",
)
PARTIAL_WHY = _text(
    "Only partly answered so far: {reason}",
    "Réponse encore partielle : {reason}",
)


@dataclass(frozen=True)
class Wording:
    """Localized question for one stage field or gate rule."""

    question: Localized
    why: Localized = field(default_factory=lambda: MISSING_WHY)
    options: LocalizedOptions = field(default_factory=lambda: DEFAULT_OPTIONS)
    target: str | None = None


FIELD_QUESTIONS: dict[str, Wording] = {
    "pitch_summary": Wording(
        _text(
            "In a few sentences, what is the idea and who is it for?",
            "En quelques phrases, quelle est l'idée et à qui s'adresse-t-elle ?",
        ),
    ),
    "clear_points": Wording(
        _text(
            "Which points of the idea are already settled?",
            "Quels points de l'idée sont déjà clairs et arrêtés ?",
        ),
    ),
    "ambiguities": Wording(
        _text(
            "Which points of the idea are still vague or open to interpretation?",
            "Quels points de l'idée restent flous ou sujets à interprétation ?",
        ),
    ),
    "missing_information": Wording(
        _text(
            "What information is still missing to describe the idea?",
            "Quelles informations manquent encore pour décrire l'idée ?",
        ),
    ),
    "problem_statement": Wording(
        _text(
            "What problem does the project solve, and for whom?",
            "Quel problème le projet résout-il, et pour qui ?",
        ),
    ),
    "users_actors": Wording(
        _text(
            "Who are the users, and which other people or systems are involved?",
            "Qui sont les utilisateurs, et quelles autres personnes ou quels systèmes sont concernés ?",
        ),
    ),
    "measurable_objectives": Wording(
        _text(
            "Which measurable objectives, each with a target figure, define success?",
            "Quels objectifs mesurables, chacun avec un chiffre cible, définissent le succès ?",
        ),
    ),
    "constraints": Wording(
        _text(
            "Which constraints apply (budget, deadline, regulation, technology)?",
            "Quelles contraintes s'appliquent (budget, délai, réglementation, technique) ?",
        ),
    ),
    "non_goals": Wording(
        _text(
            "What is explicitly out of scope?",
            "Qu'est-ce qui est explicitement hors du périmètre ?",
        ),
    ),
    "hypotheses": Wording(
        _text(
            "Which assumptions does the project rely on that still need checking?",
            "Sur quelles hypothèses, encore à vérifier, le projet repose-t-il ?",
        ),
    ),
    "initial_risks": Wording(
        _text(
            "Which risks do you already see?",
            "Quels risques voyez-vous déjà ?",
        ),
    ),
    "five_w_one_h": Wording(
        _text(
            "Can you sum the project up as who, what, where, when, why and how?",
            "Pouvez-vous résumer le projet en qui, quoi, où, quand, pourquoi et comment ?",
        ),
    ),
    "actors_personas": Wording(
        _text(
            "Which personas or actors use the product?",
            "Quels personas ou acteurs utilisent le produit ?",
        ),
    ),
    "user_journeys": Wording(
        _text(
            "Which main journeys do these users follow, step by step?",
            "Quels parcours principaux ces utilisateurs suivent-ils, étape par étape ?",
        ),
    ),
    "capabilities": Wording(
        _text(
            "Which capabilities must the product offer?",
            "Quelles capacités le produit doit-il offrir ?",
        ),
    ),
    "mvp_scope": Wording(
        _text(
            "Which capabilities belong to the first version (MVP)?",
            "Quelles capacités font partie de la première version (MVP) ?",
        ),
    ),
    "dependencies": Wording(
        _text(
            "What does the project depend on (other teams, systems, data, vendors)?",
            "De quoi le projet dépend-il (autres équipes, systèmes, données, fournisseurs) ?",
        ),
    ),
    "functional_gaps": Wording(
        _text(
            "Which functional gaps remain in these journeys?",
            "Quels manques fonctionnels subsistent dans ces parcours ?",
        ),
    ),
    "edge_cases": Wording(
        _text(
            "Which edge cases or exceptions must be handled?",
            "Quels cas limites ou exceptions faut-il gérer ?",
        ),
    ),
    "event_storming_relevant": Wording(
        _text(
            "Is the business process rich enough to model its domain events?",
            "Le processus métier est-il assez riche pour modéliser ses événements métier ?",
        ),
        options=_options(
            ("Yes, the process has many business events", "No, the process is simple"),
            ("Oui, le processus comporte de nombreux événements métier", "Non, le processus est simple"),
        ),
    ),
    "domain_events": Wording(
        _text(
            'Which business events happen in the process (for example "Order placed")?',
            "Quels événements métier se produisent dans le processus (par exemple « Commande passée ») ?",
        ),
    ),
    "not_relevant_reason": Wording(
        _text(
            "Why is modelling the domain events not useful here?",
            "Pourquoi la modélisation des événements métier n'est-elle pas utile ici ?",
        ),
    ),
    "business_goal": Wording(
        _text(
            "Which business goal should the project move?",
            "Quel objectif métier le projet doit-il faire progresser ?",
        ),
    ),
    "influential_actors": Wording(
        _text(
            "Who can help or hinder reaching this goal?",
            "Qui peut aider ou freiner l'atteinte de cet objectif ?",
        ),
    ),
    "expected_behaviors": Wording(
        _text(
            "Which change in these actors' behaviour do you expect?",
            "Quel changement de comportement attendez-vous de ces acteurs ?",
        ),
    ),
    "deliverables": Wording(
        _text(
            "Which deliverables or features will trigger these behaviours?",
            "Quels livrables ou fonctionnalités provoqueront ces comportements ?",
        ),
    ),
    "value_hypotheses": Wording(
        _text(
            "Which value assumptions link these deliverables to the goal?",
            "Quelles hypothèses de valeur relient ces livrables à l'objectif ?",
        ),
    ),
    "risks_by_category": Wording(
        _text(
            "Which risks threaten the project, and how will you reduce each one?",
            "Quels risques menacent le projet, et comment réduire chacun d'eux ?",
        ),
    ),
    "mvp_user_stories": Wording(
        _text(
            "Which user stories make up the MVP?",
            "Quelles user stories composent le MVP ?",
        ),
    ),
    "risk_spikes": Wording(
        _text(
            "Which spikes are needed to reduce the main risks?",
            "Quels spikes (explorations) faut-il pour réduire les principaux risques ?",
        ),
    ),
    "cross_cutting_work": Wording(
        _text(
            "Which cross-cutting work is needed (security, monitoring, deployment)?",
            "Quels travaux transverses faut-il prévoir (sécurité, supervision, déploiement) ?",
        ),
    ),
    "slices": Wording(
        _text(
            "How should the backlog be split into vertical delivery slices?",
            "Comment découper le backlog en tranches de livraison verticales ?",
        ),
    ),
}

RULE_QUESTIONS: dict[str, Wording] = {
    "specific_pitch": Wording(
        _text(
            "Can you describe the idea in at least one full sentence: what, for whom and why?",
            "Pouvez-vous décrire l'idée en au moins une phrase complète : quoi, pour qui et pourquoi ?",
        ),
        _text(
            "A pitch of a few words is too vague to frame the project.",
            "Un pitch de quelques mots est trop vague pour cadrer le projet.",
        ),
        target="pitch_summary",
    ),
    "measurable_objectives": Wording(
        _text(
            "Which figure or target value makes each objective measurable?",
            "Quel chiffre ou quelle valeur cible rend chaque objectif mesurable ?",
        ),
        _text(
            "Each objective needs a number so you can check later whether it was reached.",
            "Chaque objectif a besoin d'un chiffre pour vérifier ensuite s'il est atteint.",
        ),
        target="measurable_objectives",
    ),
    "mvp_capabilities": Wording(
        _text(
            "Some MVP items are not in the capability list: should they become capabilities or leave the MVP?",
            "Certains éléments du MVP ne figurent pas dans les capacités : faut-il les ajouter aux capacités ou les retirer du MVP ?",
        ),
        _text(
            "The MVP can only contain capabilities that are listed.",
            "Le MVP ne peut contenir que des capacités déjà listées.",
        ),
        _options(
            ("Add them to the capabilities", "Remove them from the MVP"),
            ("Les ajouter aux capacités", "Les retirer du MVP"),
        ),
        target="mvp_scope",
    ),
    "irrelevance_justified": Wording(
        _text(
            "Why is event storming not relevant for this project?",
            "Pourquoi l'event storming n'est-il pas pertinent pour ce projet ?",
        ),
        _text(
            "Skipping event storming must be justified explicitly.",
            "Écarter l'event storming doit être justifié explicitement.",
        ),
        target="not_relevant_reason",
    ),
    "relevant_events": Wording(
        _text(
            "Which domain events should be modelled?",
            "Quels événements métier faut-il modéliser ?",
        ),
        _text(
            "Event storming was judged relevant, so it needs domain events.",
            "L'event storming a été jugé pertinent : il faut donc des événements métier.",
        ),
        target="domain_events",
    ),
    "consistent_actors": Wording(
        _text(
            "Some impact actors are not among the stage 1 users: should they be added there or replaced?",
            "Certains acteurs d'impact ne figurent pas parmi les utilisateurs de l'étape 1 : faut-il les y ajouter ou les remplacer ?",
        ),
        _text(
            "Impact actors must match the users identified during problem framing.",
            "Les acteurs d'impact doivent correspondre aux utilisateurs identifiés au cadrage du problème.",
        ),
        _options(
            ("Replace them with existing stage 1 users", "Add them to the stage 1 users"),
            ("Les remplacer par des utilisateurs de l'étape 1", "Les ajouter aux utilisateurs de l'étape 1"),
        ),
        target="influential_actors",
    ),
    "concrete_risks": Wording(
        _text(
            "Which other risks should be listed, in at least two categories, each with a mitigation and an action?",
            "Quels autres risques faut-il lister, dans au moins deux catégories, chacun avec une mitigation et une action ?",
        ),
        _text(
            "At least three concrete risks across two categories are needed to plan their mitigation.",
            "Il faut au moins trois risques concrets dans deux catégories pour en planifier la réduction.",
        ),
        target="risks_by_category",
    ),
    "backlog_traceability": Wording(
        _text(
            "For each backlog item, what are its objective, its definition of done and the goal, risk or assumption it serves (any EARS criteria written as WHEN ... THE SYSTEM SHALL ...)?",
            "Pour chaque élément du backlog, quels sont son objectif, sa définition de terminé et l'objectif, le risque ou l'hypothèse qu'il sert (critères EARS éventuels au format WHEN ... THE SYSTEM SHALL ...) ?",
        ),
        _text(
            "Every backlog item must trace back to an earlier goal, risk or assumption.",
            "Chaque élément du backlog doit se rattacher à un objectif, un risque ou une hypothèse des étapes précédentes.",
        ),
        target="mvp_user_stories",
    ),
    "backlog_scope": Wording(
        _text(
            "Some MVP stories target a capability outside the stage 2 MVP scope: should the stories or the scope change?",
            "Certaines stories du MVP visent une capacité hors du périmètre MVP de l'étape 2 : faut-il modifier les stories ou le périmètre ?",
        ),
        _text(
            "MVP stories must stay within the MVP scope agreed in stage 2.",
            "Les stories du MVP doivent rester dans le périmètre MVP validé à l'étape 2.",
        ),
        _options(
            ("Change the stories", "Extend the stage 2 MVP scope"),
            ("Modifier les stories", "Élargir le périmètre MVP de l'étape 2"),
        ),
        target="mvp_user_stories",
    ),
    "walking_skeleton": Wording(
        _text(
            "Which minimal end-to-end slice (slice 0) sets up the shared contracts?",
            "Quelle tranche minimale de bout en bout (tranche 0) met en place les contrats partagés ?",
        ),
        _text(
            "Exactly one walking skeleton must come first so later slices can build on it.",
            "Une seule tranche squelette doit venir en premier pour que les suivantes s'appuient dessus.",
        ),
        target="slices",
    ),
    "mvp_assignment": Wording(
        _text(
            "Which slice delivers each MVP backlog item?",
            "Quelle tranche livre chaque élément MVP du backlog ?",
        ),
        _text(
            "Every MVP item must be delivered by exactly one slice.",
            "Chaque élément MVP doit être livré par une seule tranche.",
        ),
        target="slices",
    ),
    "backlog_references": Wording(
        _text(
            "Some slices reference backlog items that do not exist: which items did you mean?",
            "Certaines tranches citent des éléments de backlog inexistants : lesquels vouliez-vous dire ?",
        ),
        _text(
            "Slices can only reference stage 6 backlog items.",
            "Les tranches ne peuvent citer que des éléments du backlog de l'étape 6.",
        ),
        target="slices",
    ),
    "acyclic_dependencies": Wording(
        _text(
            "In which order do the slices depend on each other, without loops?",
            "Dans quel ordre les tranches dépendent-elles les unes des autres, sans boucle ?",
        ),
        _text(
            "Dependencies must point to existing slices and never form a cycle.",
            "Les dépendances doivent viser des tranches existantes et ne jamais former de cycle.",
        ),
        target="slices",
    ),
    "contract_ownership": Wording(
        _text(
            "Which slice owns each shared contract?",
            "Quelle tranche possède chaque contrat partagé ?",
        ),
        _text(
            "Every contract needs one owner, and every consumed contract must exist.",
            "Chaque contrat a besoin d'un seul propriétaire, et tout contrat consommé doit exister.",
        ),
        target="slices",
    ),
    "integration_scenarios": Wording(
        _text(
            "Which end-to-end scenario (Given/When/Then) proves that each slice works?",
            "Quel scénario de bout en bout (Étant donné/Quand/Alors) prouve que chaque tranche fonctionne ?",
        ),
        _text(
            "Every slice needs at least one complete integration scenario.",
            "Chaque tranche a besoin d'au moins un scénario d'intégration complet.",
        ),
        target="slices",
    ),
    "cross_cutting_foundation": Wording(
        _text(
            "Can all cross-cutting work be placed once in slice 0?",
            "Peut-on placer tous les travaux transverses, une seule fois, dans la tranche 0 ?",
        ),
        _text(
            "Cross-cutting work belongs to the foundation slice, exactly once.",
            "Les travaux transverses appartiennent à la tranche socle, une seule fois.",
        ),
        target="slices",
    ),
    "domain_ownership": Wording(
        _text(
            "Which aggregate or capability does each slice own?",
            "Quel agrégat ou quelle capacité chaque tranche possède-t-elle ?",
        ),
        _text(
            "Each slice must own a distinct part of the domain.",
            "Chaque tranche doit posséder une partie distincte du domaine.",
        ),
        target="slices",
    ),
    "contradictions": Wording(
        _text(
            "These statements conflict: {items}. Which one is correct?",
            "Ces informations se contredisent : {items}. Laquelle est la bonne ?",
        ),
        _text(
            "The stage cannot be validated while the facts disagree.",
            "L'étape ne peut pas être validée tant que les faits se contredisent.",
        ),
        _options(
            (
                "The most recent statement",
                "The earlier statement",
                "Both, depending on the context: I will explain",
            ),
            ("La plus récente", "La plus ancienne", "Les deux, selon le contexte : je précise"),
        ),
    ),
}


def _question(
    wording: Wording,
    *,
    language: Language,
    why: str,
    target: str | None,
    **values: str,
) -> OpenQuestionItem:
    options = list(wording.options[language])
    return OpenQuestionItem(
        question=wording.question[language].format(**values),
        why_it_matters=why,
        options=options,
        recommended_option=options[0],
        field=target,
    )


def field_question(name: str, *, language: Language, partial_reason: str | None = None) -> OpenQuestionItem:
    """Phrase the question asking for one stage field.

    Args:
        name (str): Stage field name.
        language (Language): Session language.
        partial_reason (str | None): Why the current value is only partial.

    Returns:
        OpenQuestionItem: Blocking question targeting the field.
    """
    wording = FIELD_QUESTIONS[name]
    why = (
        PARTIAL_WHY[language].format(reason=partial_reason.strip())
        if partial_reason and partial_reason.strip()
        else wording.why[language]
    )
    return _question(wording, language=language, why=why, target=name)


def gate_questions(
    validation: StageValidationResult,
    *,
    language: Language,
    partial_fields: dict[str, str],
    contradictions: list[str],
    model_questions: list[OpenQuestionItem],
) -> list[OpenQuestionItem]:
    """Phrase each failed readiness check as one answerable question.

    A check is skipped when an open model question already targets its field, and a rule is
    skipped when its own field is already asked for.

    Args:
        validation (StageValidationResult): Authoritative gate result.
        language (Language): Session language.
        partial_fields (dict[str, str]): Partial coverage reasons by field.
        contradictions (list[str]): Unresolved contradictions.
        model_questions (list[OpenQuestionItem]): Questions already asked by the model.

    Returns:
        list[OpenQuestionItem]: Gate questions with `gate:` identifiers.
    """
    asked = {q.field for q in model_questions if q.field and q.status is OpenQuestionStatus.OPEN}
    failed = [item for item in validation.readiness if not item.passed and item.id != "blocking_questions"]
    failed_fields = {item.id.removeprefix("field:") for item in failed if item.id.startswith("field:")}
    questions = []
    for item in failed:
        if item.id.startswith("field:"):
            name = item.id.removeprefix("field:")
            partial = validation.coverage.get(name) is CoverageStatus.PARTIAL
            question = field_question(
                name,
                language=language,
                partial_reason=partial_fields.get(name) if partial else None,
            )
        else:
            wording = RULE_QUESTIONS[item.id]
            if wording.target in failed_fields:
                continue
            question = _question(
                wording,
                language=language,
                why=wording.why[language],
                target=wording.target,
                items="; ".join(contradictions),
            )
        if question.field in asked:
            continue
        questions.append(
            question.model_copy(update={"id": f"{GATE_ID_PREFIX}{uuid4().hex[:GATE_ID_HEX_LENGTH]}"}),
        )
    return questions
