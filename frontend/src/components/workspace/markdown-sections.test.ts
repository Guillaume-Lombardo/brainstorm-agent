import { describe, expect, it } from "vitest";

import { splitSections } from "./markdown-sections";

describe("splitSections", () => {
  it("splits on level-2 headings and keeps the preamble", () => {
    expect(splitSections("# Title\n\n## Facts\n- a\n## Risks\n- b")).toEqual([
      { heading: null, markdown: "# Title\n\n" },
      { heading: "Facts", markdown: "## Facts\n- a\n" },
      { heading: "Risks", markdown: "## Risks\n- b\n" },
    ]);
  });

  it("ignores level-3 headings", () => {
    expect(splitSections("## A\n### Sub\ntext").map((section) => section.heading)).toEqual(["A"]);
  });
});
