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

## Pitch

A planner.

# Open Questions and Uncertainties

- None currently identified.

## Open Questions

- Who pays? (blocking): It changes the scope. | Options: ['Users | teams', 'Ads'] | Recommended: Ads

# Questions to Continue

- Who pays?

# Stage Deliverable

## Pitch

### Facts

- None of this is a placeholder.

### Assumptions

- Weekly use (to confirm)

### Open Questions

- Who pays?

### Readiness

- 1/2 passed/total

### Clarifications

### Transition Decision

- Stage clear enough: no

### Delivery waves

- Wave 0: slice-0`;

describe("readableDocument", () => {
  it("drops the parts shown elsewhere in the workspace and the empty ones", () => {
    const shown = readableDocument(DOCUMENT);
    expect(shown.split("\n").filter((line) => line.startsWith("#"))).toEqual([
      "# Structured Summary",
      "## Pitch",
      "# Open Questions and Uncertainties",
      "## Open Questions",
      "# Stage Deliverable",
      "## Pitch",
      "### Facts",
      "### Assumptions",
      "### Delivery waves",
    ]);
    expect(shown).toContain("A planner.");
    expect(shown).toContain("- Wave 0: slice-0");
    expect(shown).not.toContain("passed/total");
  });
});

describe("translateDocument", () => {
  it("translates the template, not what was said", () => {
    const shown = translateDocument(DOCUMENT, MESSAGES.fr.document);
    expect(shown).toContain("# Synthèse");
    expect(shown).toContain("- Aucune incertitude identifiée.");
    expect(shown).toContain("- None of this is a placeholder.");
    expect(shown).toContain("- Weekly use (à confirmer)");
    expect(shown).toContain("A planner.");
  });

  it("leaves the options of a question to the questions panel", () => {
    expect(translateDocument(DOCUMENT, MESSAGES.en.document)).toContain(
      "- Who pays? (blocking): It changes the scope.\n",
    );
  });
});
