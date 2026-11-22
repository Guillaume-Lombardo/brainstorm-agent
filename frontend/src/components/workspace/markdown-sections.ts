import { STAGE_FIELDS } from "@/lib/backend/generated/stage-fields";
import { STAGES, type CoverageStatus, type Stage } from "@/lib/backend/types";
import { serverText, type Messages } from "@/lib/i18n";

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

/** The decision repeats the checks listed above it. */
const REPEATED_REASON = /^- Reason: /;

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
    if (part.heading !== "### Transition Decision" || !REPEATED_REASON.test(text)) {
      part.lines.push(text);
    }
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

/** Stage headings of the backend template, in workflow order. */
const STAGE_HEADINGS = [
  "Stage 0 - Initial Pitch",
  "Stage 1 - Problem Framing and 5W1H",
  "Stage 2 - User Story Mapping",
  "Stage 3 - Event Storming",
  "Stage 4 - Impact Mapping",
  "Stage 5 - Risk Storming and Pre-mortem",
  "Stage 6 - Backlog Synthesis",
  "Stage 7 - Delivery Slicing",
];

export function headingStage(heading: string | null): Stage | undefined {
  return heading === null ? undefined : STAGES[STAGE_HEADINGS.indexOf(heading)];
}

const FIELD_LABELS = new Map(
  Object.values(STAGE_FIELDS).flatMap((fields) => fields.map(({ name, label }) => [name, label])),
) as ReadonlyMap<string, string>;

function fieldLabel(name: string, messages: Messages): string {
  return messages.fields[name] ?? FIELD_LABELS.get(name) ?? name;
}

/** A check of the backend rules, in the interface language. */
function checkText(message: string, messages: Messages): string {
  const field = /^Required field (\w+): (clear|partial|missing)(.*)$/.exec(message);
  return field
    ? `${fieldLabel(field[1], messages)} (${messages.stageDetails.coverage[field[2] as CoverageStatus]})${field[3]}`
    : serverText(message, messages);
}

/** A list item of the assessment parts, in the interface language. */
function assessmentText(section: string, text: string, messages: Messages): string {
  if (section === "Stage Fields") {
    return text.replace(/^\w+(?=: )/, (name) => fieldLabel(name, messages));
  }
  if (section === "Readiness") {
    const check = /^(\[[ x]\]) [\w:.-]+: (.+)$/.exec(text);
    const coverage = /^(\w+): (clear|partial|missing)$/.exec(text);
    return check
      ? `${check[1]} ${checkText(check[2], messages)}`
      : coverage
        ? `${fieldLabel(coverage[1], messages)} (${messages.stageDetails.coverage[coverage[2] as CoverageStatus]})`
        : text;
  }
  return text;
}

/** Translates what the template wrote; what the user or the model wrote stays as it is. */
export function translateDocument(
  markdown: string,
  messages: Messages,
  { hideOptions = false } = {},
): string {
  const words = messages.document;
  let section = "";
  return markdownLines(markdown)
    .map(({ text: line, code }) => {
      const match = code ? null : /^(#{1,6}\s+|- |\| |)(.+?)(\s*)$/.exec(line);
      if (!match) {
        return line;
      }
      const [, marker, text, end] = match;
      if (marker.startsWith("#")) {
        section = text;
      }
      if (marker && Object.hasOwn(words.lines, text)) {
        return marker + words.lines[text] + end;
      }
      if (marker.startsWith("#")) {
        return marker + text.replace(/^Slice (?=\S+$)/, words.slice) + end;
      }
      const rules = Object.hasOwn(words.sections, section) ? words.sections[section] : [];
      // The options of the current questions are in the questions panel.
      const shown =
        hideOptions && section === "Open Questions"
          ? text.replace(/ \| Options: \[.*\] \| Recommended: .+$/, "")
          : assessmentText(section, text, messages);
      const translated = rules.reduce(
        (result, [source, word]) => result.replace(source, word),
        shown,
      );
      return marker + translated + end;
    })
    .join("\n");
}
