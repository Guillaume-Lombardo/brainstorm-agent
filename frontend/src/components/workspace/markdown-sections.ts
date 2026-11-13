export interface MarkdownSection {
  /** `null` for the preamble before the first `##` heading. */
  heading: string | null;
  markdown: string;
}

/** Split a stage document on its `##` headings so sections can be commented. */
export function splitSections(markdown: string): MarkdownSection[] {
  const sections: MarkdownSection[] = [];
  let current: MarkdownSection = { heading: null, markdown: "" };
  for (const line of markdown.split("\n")) {
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match) {
      if (current.heading !== null || current.markdown.trim()) {
        sections.push(current);
      }
      current = { heading: match[1], markdown: `${line}\n` };
    } else {
      current.markdown += `${line}\n`;
    }
  }
  if (current.heading !== null || current.markdown.trim()) {
    sections.push(current);
  }
  return sections;
}
