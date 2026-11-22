export interface MarkdownSection {
  /** `null` for the text under a `#` heading, before its first `##` heading. */
  heading: string | null;
  markdown: string;
}

interface Line {
  text: string;
  /** Inside a fenced code block, where nothing is a heading or a list item. */
  code: boolean;
}

function markdownLines(markdown: string): Line[] {
  let fence = "";
  return markdown.split("\n").map((text) => {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(text)?.[1];
    if (fence) {
      if (marker?.startsWith(fence) && text.trim() === marker) {
        fence = "";
      }
      return { text, code: true };
    }
    fence = marker ?? "";
    return { text, code: marker !== undefined };
  });
}

/** Split a stage document on its headings so its `##` sections can be commented. */
export function splitSections(markdown: string): MarkdownSection[] {
  const sections: MarkdownSection[] = [];
  let current: MarkdownSection = { heading: null, markdown: "" };
  for (const { text, code } of markdownLines(markdown)) {
    const match = code ? null : /^##?\s+(.+?)\s*$/.exec(text);
    if (match) {
      if (current.heading !== null || current.markdown.trim()) {
        sections.push(current);
      }
      current = { heading: text.startsWith("##") ? match[1] : null, markdown: "" };
    }
    current.markdown += `${text}\n`;
  }
  if (current.heading !== null || current.markdown.trim()) {
    sections.push(current);
  }
  return sections;
}

/** Parts repeating the questions the document already lists. */
const REPEATED = new Set(["# Questions to Continue", "### Open Questions"]);
/** Parts recording how the stage was assessed, folded under the document. */
const RECORD = new Set(["### Stage Fields", "### Readiness", "### Transition Decision"]);

/** Stage document as read on screen: no repeated nor empty part. Exports keep everything. */
export function readableDocument(markdown: string): { body: string; record: string } {
  const parts: { heading: string; level: number; lines: string[] }[] = [];
  let part = { heading: "", level: 0, lines: [] as string[] };
  for (const { text, code } of markdownLines(markdown)) {
    const level = code ? undefined : /^(#{1,6})\s/.exec(text)?.[1].length;
    if (level) {
      parts.push(part);
      part = { heading: text.trim(), level, lines: [] };
    }
    part.lines.push(text);
  }
  parts.push(part);

  const body: typeof parts = [];
  const record: typeof parts = [];
  let target: typeof parts | null = body;
  let until = Infinity;
  for (const current of parts) {
    if (current.level <= until) {
      const moved = REPEATED.has(current.heading) || RECORD.has(current.heading);
      until = moved ? current.level : Infinity;
      target = !moved ? body : RECORD.has(current.heading) ? record : null;
    }
    target?.push(current);
  }
  return { body: joinFilled(body), record: joinFilled(record) };
}

function joinFilled(parts: { level: number; lines: string[] }[]): string {
  return parts
    .filter(
      ({ level, lines }, index) =>
        (parts[index + 1]?.level ?? 0) > level || lines.slice(level ? 1 : 0).some((l) => l.trim()),
    )
    .flatMap(({ lines }) => lines)
    .join("\n");
}

/** Words of the backend document template, by English source text. */
export interface DocumentWords {
  /** Whole headings, list items and table headers. */
  lines: Record<string, string>;
  /** First word of the heading of a delivery slice. */
  slice: string;
  /** Words inside the lines of one section, by English heading. */
  sections: Record<string, readonly (readonly [RegExp, string])[]>;
}

/** Translates what the template wrote; what the user or the model wrote stays as it is. */
export function translateDocument(
  markdown: string,
  words: DocumentWords,
  { hideOptions = false } = {},
): string {
  let section = "";
  return markdownLines(markdown)
    .map(({ text: line, code }) => {
      const match = code ? null : /^(#{1,6}\s+|- |\| |)(.+?)\s*$/.exec(line);
      if (!match) {
        return line;
      }
      const [, marker, text] = match;
      if (marker.startsWith("#")) {
        section = text;
      }
      if (marker && Object.hasOwn(words.lines, text)) {
        return marker + words.lines[text];
      }
      if (marker.startsWith("#")) {
        return marker + text.replace(/^Slice (?=\S+$)/, words.slice);
      }
      const rules = Object.hasOwn(words.sections, section) ? words.sections[section] : [];
      // The options of the current questions are in the questions panel.
      const shown =
        hideOptions && section === "Open Questions"
          ? text.replace(/ \| Options: \[.*\] \| Recommended: .+$/, "")
          : text;
      return marker + rules.reduce((result, [source, word]) => result.replace(source, word), shown);
    })
    .join("\n");
}
