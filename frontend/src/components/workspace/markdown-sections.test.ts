import { describe, expect, it } from "vitest";

import { MESSAGES } from "@/lib/i18n";

import { readableDocument, splitSections, translateDocument } from "./markdown-sections";

describe("splitSections", () => {
  it("splits on level-2 headings and keeps the preamble", () => {
    expect(splitSections("# Title\n\n## Facts\n- a\n## Risks\n- b")).toEqual([
      { heading: null, markdown: "# Title\n\n" },
      { heading: "Facts", markdown: "## Facts\n- a\n" },
      { heading: "Risks", markdown: "## Risks\n- b\n" },
    ]);
  });

  it("keeps a following level-1 heading out of the section", () => {
    expect(splitSections("## A\ntext\n# B\nmore").map((section) => section.heading)).toEqual([
      "A",
      null,
    ]);
  });

  it("ignores level-3 headings", () => {
    expect(splitSections("## A\n### Sub\ntext").map((section) => section.heading)).toEqual(["A"]);
  });
});

const DOCUMENT = `# Structured Summary

## Stage 0 - Initial Pitch

A planner.

# Open Questions and Uncertainties

- None currently identified.

## Open Questions

- Who pays? (blocking): It changes the scope. | Options: ['Users | teams', 'Ads'] | Recommended: Ads

# Questions to Continue

- Who pays?

# Stage Deliverable

## Stage 0 - Initial Pitch

### Facts

- None of this is a placeholder.

### Assumptions

- Weekly use (to confirm)

### Open Questions

- Who pays?

### Readiness

- 1/2 passed/total
- [x] field:pitch_summary: Required field pitch_summary: clear
- [ ] blocking_questions: Blocking questions remain open.
- ambiguities: missing

### Clarifications

### Transition Decision

- Stage clear enough: no
- Reason: Required field ambiguities: partial (later); Blocking questions remain open.

### Delivery waves

- Wave 0: slice-0`;

describe("readableDocument", () => {
  it("drops the repeated and empty parts, and sets the assessment apart", () => {
    const { body: shown, record } = readableDocument(DOCUMENT);
    expect(shown.split("\n").filter((line) => line.startsWith("#"))).toEqual([
      "# Structured Summary",
      "## Stage 0 - Initial Pitch",
      "# Open Questions and Uncertainties",
      "## Open Questions",
      "# Stage Deliverable",
      "## Stage 0 - Initial Pitch",
      "### Facts",
      "### Assumptions",
      "### Delivery waves",
    ]);
    expect(shown).toContain("A planner.");
    expect(shown).toContain("- Wave 0: slice-0");
    expect(shown).not.toContain("passed/total");
    expect(record).toContain("### Readiness\n\n- 1/2 passed/total");
    expect(translateDocument(record, MESSAGES.fr)).toBe(`### Contrôles

- 1/2 contrôles validés
- [x] Résumé du pitch (clair)
- [ ] Des questions bloquantes restent ouvertes.
- Ambiguïtés (manquant)

### Décision de passage

- Étape assez claire\u00a0: non
- Raison\u00a0: Ambiguïtés (partiel) (later); Des questions bloquantes restent ouvertes.
`);
    expect(record).toContain("- Stage clear enough: no");
  });

  it("leaves code blocks as they are", () => {
    const code = "# A\n\n```sh\n# Questions to Continue\n## Facts\n- None.\n```";
    expect(readableDocument(code)).toEqual({ body: code, record: "" });
    expect(splitSections(code)).toHaveLength(1);
    expect(translateDocument(code, MESSAGES.fr)).toBe(code);
  });
});

describe("translateDocument", () => {
  it("translates the template, not what was said", () => {
    const shown = translateDocument(DOCUMENT, MESSAGES.fr);
    expect(shown).toContain("# Synthèse");
    expect(shown).toContain("- Aucune incertitude identifiée.");
    expect(shown).toContain("- None of this is a placeholder.");
    expect(shown).toContain("- Weekly use (à confirmer)");
    expect(shown).toContain("A planner.");
    expect(shown).toContain("- Vague 0\u00a0: slice-0");
    expect(shown).toContain("(bloquante)\u00a0: It changes the scope. | Options\u00a0: [");
  });

  it("only rewrites template words in their own section", () => {
    const said =
      "### Facts\n\n- toString\n- Wave 2: later | Options: [a, b]\n\nGiven up.  \nEnd.\n\n### Open Questions\n\n- Is `?: ` fine";
    expect(translateDocument(said, MESSAGES.fr, { hideOptions: true })).toBe(
      said.replace("Facts", "Faits").replace("Open Questions", "Questions ouvertes"),
    );
  });

  it("translates the delivery plan", () => {
    const plan = `| Slice | Goal | Backlog |
| --- | --- | --- |
| slice-0 | Goal | A |

## Slice slice-0

### Owned domain

Cross-cutting foundation

### Integration scenarios

Given a user
When they book
Then it is saved`;
    expect(translateDocument(plan, MESSAGES.fr)).toBe(`| Lot | Objectif | Backlog |
| --- | --- | --- |
| slice-0 | Goal | A |

## Lot slice-0

### Domaine porté

Socle transverse

### Scénarios d'intégration

Étant donné a user
Quand they book
Alors it is saved`);
  });

  it("leaves the options of the current questions to the questions panel", () => {
    expect(translateDocument(DOCUMENT, MESSAGES.en, { hideOptions: true })).toContain(
      "- Who pays? (blocking): It changes the scope.\n",
    );
  });
});
