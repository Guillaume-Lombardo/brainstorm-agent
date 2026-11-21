/** Replace `value.slice(start, end)` with `text`, leaving the caret after it. */
export interface TextEdit {
  start: number;
  end: number;
  text: string;
}

export type ListKind = "bullet" | "numbered";

const BULLET = "•";
const ITEM = /^(\s*)(?:([-*•])|(\d+)([.)]))[ \t]+(.*)$/;

function lineBounds(value: string, position: number): { start: number; end: number } {
  const start = value.lastIndexOf("\n", position - 1) + 1;
  const next = value.indexOf("\n", position);
  return { start, end: next === -1 ? value.length : next };
}

/**
 * What Enter does on a list item: start the next item, or leave the list on an empty item.
 *
 * Args:
 *   value (string): Composer text.
 *   start (number): Selection start.
 *   end (number): Selection end.
 *
 * Returns:
 *   TextEdit | null: The edit to apply, or `null` when the caret is not on a list item.
 */
export function continueList(value: string, start: number, end: number): TextEdit | null {
  if (start !== end) {
    return null;
  }
  const line = lineBounds(value, start);
  const match = ITEM.exec(value.slice(line.start, line.end));
  if (!match) {
    return null;
  }
  const [, indent, bullet, number, delimiter, content] = match;
  if (content.trim() === "") {
    return { start: line.start, end: line.end, text: "" };
  }
  const marker = bullet ?? `${Number(number) + 1}${delimiter}`;
  return { start, end, text: `\n${indent}${marker} ` };
}

/**
 * Turns the selected lines into a list of `kind`, or back into plain lines if they already are.
 *
 * Args:
 *   value (string): Composer text.
 *   start (number): Selection start.
 *   end (number): Selection end.
 *   kind (ListKind): Bullet or numbered list.
 *
 * Returns:
 *   TextEdit: The edit replacing the selected lines.
 */
export function toggleList(value: string, start: number, end: number, kind: ListKind): TextEdit {
  const first = lineBounds(value, start).start;
  const last = lineBounds(value, Math.max(start, end)).end;
  const lines = value.slice(first, last).split("\n");
  const items = lines.map((line) => ITEM.exec(line));
  const isKind = (item: RegExpExecArray | null) =>
    item !== null && (kind === "bullet" ? item[2] !== undefined : item[3] !== undefined);
  const text = items.every(isKind)
    ? items.map((item) => `${item![1]}${item![5]}`)
    : lines.map((line, index) => {
        const content = items[index] ? items[index][5] : line.trimStart();
        const indent = /^\s*/.exec(line)![0];
        return `${indent}${kind === "bullet" ? BULLET : `${index + 1}.`} ${content}`;
      });
  return { start: first, end: last, text: text.join("\n") };
}
