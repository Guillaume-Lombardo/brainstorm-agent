export interface MarkdownSection {
  /** `null` for the text under a `#` heading, before its first `##` heading. */
  heading: string | null;
  markdown: string;
}

/** Split a stage document on its headings so its `##` sections can be commented. */
export function splitSections(markdown: string): MarkdownSection[] {
  const sections: MarkdownSection[] = [];
  let current: MarkdownSection = { heading: null, markdown: "" };
  for (const line of markdown.split("\n")) {
    const match = /^##?\s+(.+?)\s*$/.exec(line);
    if (match) {
      if (current.heading !== null || current.markdown.trim()) {
        sections.push(current);
      }
      current = { heading: line.startsWith("##") ? match[1] : null, markdown: "" };
    }
    current.markdown += `${line}\n`;
  }
  if (current.heading !== null || current.markdown.trim()) {
    sections.push(current);
  }
  return sections;
}

/** Parts of a stage document the workspace already shows next to it. */
const SHOWN_ELSEWHERE = new Set([
  "# Questions to Continue",
  "### Open Questions",
  "### Stage Fields",
  "### Readiness",
  "### Transition Decision",
]);

/** Stage document as read on screen: no repeated nor empty part. Exports keep everything. */
export function readableDocument(markdown: string): string {
  const parts: { heading: string; level: number; lines: string[] }[] = [];
  let part = { heading: "", level: 0, lines: [] as string[] };
  for (const line of markdown.split("\n")) {
    const level = /^(#{1,6})\s/.exec(line)?.[1].length;
    if (level) {
      parts.push(part);
      part = { heading: line.trim(), level, lines: [] };
    }
    part.lines.push(line);
  }
  parts.push(part);

  let hidden = Infinity;
  const shown = parts.filter(({ heading, level }) => {
    if (level <= hidden) {
      hidden = SHOWN_ELSEWHERE.has(heading) ? level : Infinity;
    }
    return hidden === Infinity;
  });
  return shown
    .filter(
      ({ level, lines }, index) =>
        (shown[index + 1]?.level ?? 0) > level || lines.slice(level ? 1 : 0).some((l) => l.trim()),
    )
    .flatMap(({ lines }) => lines)
    .join("\n");
}

/** Words of the backend document template, by English source text. */
export interface DocumentWords {
  /** Whole headings and list items. */
  lines: Record<string, string>;
  /** Labels inside a list item. */
  labels: Record<string, string>;
}

/** Translates what the template wrote; what the user or the model wrote stays as it is. */
export function translateDocument(markdown: string, words: DocumentWords): string {
  return markdown
    .split("\n")
    .map((line) => {
      const match = /^(#{1,6}\s+|- )(.+?)\s*$/.exec(line);
      if (!match) {
        return line;
      }
      const [, marker, text] = match;
      const whole = words.lines[text];
      if (whole || marker !== "- ") {
        return marker + (whole ?? text);
      }
      // The options of a question are in the questions panel.
      const item = text.replace(/ \| Options: \[.*$/, "");
      return (
        marker +
        Object.entries(words.labels).reduce(
          (result, [source, label]) => result.replaceAll(source, label),
          item,
        )
      );
    })
    .join("\n");
}
