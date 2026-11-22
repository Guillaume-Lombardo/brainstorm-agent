/** Replace `value.slice(start, end)` with `text`, leaving the caret after it. */
export interface TextEdit {
  start: number;
  end: number;
  text: string;
  /** Caret distance from the end of the new text, when it must not be right after it. */
  caretFromEnd?: number;
}

/** Bullet of each nesting level; deeper levels keep the last one. */
const BULLETS = ["•", "◦", "▪"];
const INDENT = "  ";
const ITEM = /^(\s*)(?:([-*•◦▪])|(\d{1,9})([.)]))[ \t]+(.*)$/;
/** A marker that was just typed: the caret is right after its space. */
const TYPED_MARKER = /^(\s*)(?:[-*]|(\d{1,9})([.)])) $/;

interface ListItem {
  level: number;
  /** Null on a bulleted item. */
  number: number | null;
  delimiter: string;
  /** Line start up to the item text. */
  prefix: string;
  content: string;
}

/** Two leading spaces (or one tab) make a level; a single one already counts. */
function levelOf(indent: string): number {
  return Math.ceil(indent.replaceAll("\t", INDENT).length / INDENT.length);
}

function parse(line: string): ListItem | null {
  const match = ITEM.exec(line);
  if (!match) {
    return null;
  }
  const [prefix, indent, , number, delimiter, content] = match;
  return {
    level: levelOf(indent),
    number: number === undefined ? null : Number(number),
    delimiter: delimiter ?? "",
    prefix: prefix.slice(0, prefix.length - content.length),
    content,
  };
}

function lineBounds(value: string, position: number): { start: number; end: number } {
  const start = position === 0 ? 0 : value.lastIndexOf("\n", position - 1) + 1;
  const next = value.indexOf("\n", position);
  return { start, end: next === -1 ? value.length : next };
}

/** The item a new one at `level` would follow in the same list, reading up from `lineStart`. */
function sibling(value: string, lineStart: number, level: number): ListItem | null {
  const above = lineStart === 0 ? [] : value.slice(0, lineStart - 1).split("\n");
  for (const line of above.reverse()) {
    const item = parse(line);
    if (!item || item.level < level) {
      return null;
    }
    if (item.level === level) {
      return item;
    }
  }
  return null;
}

function bulletPrefix(level: number): string {
  return `${INDENT.repeat(level)}${BULLETS[Math.min(level, BULLETS.length - 1)]} `;
}

function numberPrefix(level: number, number: number, delimiter: string): string {
  return `${INDENT.repeat(level)}${number}${delimiter} `;
}

/**
 * Turns the marker just typed at the start of a line into a list item: `* ` or `- ` becomes a
 * bullet, and a number follows the list above it, or starts a new list at that number. Leading
 * spaces give the nesting level.
 *
 * Args:
 *   value (string): Composer text.
 *   caret (number): Caret position, right after the typed space.
 *
 * Returns:
 *   TextEdit | null: The edit to apply, or `null` when no marker was just typed.
 */
export function detectList(value: string, caret: number): TextEdit | null {
  const { start } = lineBounds(value, caret);
  const match = TYPED_MARKER.exec(value.slice(start, caret));
  if (!match) {
    return null;
  }
  const [typed, indent, number, delimiter] = match;
  const level = levelOf(indent);
  const before = sibling(value, start, level);
  const text =
    number === undefined
      ? bulletPrefix(level)
      : numberPrefix(
          level,
          before?.number === null || !before ? Number(number) : before.number + 1,
          delimiter,
        );
  return text === typed ? null : { start, end: caret, text };
}

/**
 * What Enter does on a list item: start the next item, or leave the list on an empty item (one
 * level at a time when it is nested).
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
  const line = lineBounds(value, start);
  if (end > line.end) {
    return null;
  }
  const item = parse(value.slice(line.start, line.end));
  // Only edit inside the item text: a caret or selection over the marker keeps Enter as send.
  if (!item || start < line.start + item.prefix.length) {
    return null;
  }
  if (item.content.trim() === "") {
    return indentItem(value, start, -1) ?? { start: line.start, end: line.end, text: "" };
  }
  const marker =
    item.number === null ? item.prefix : item.prefix.replace(/\d+/, String(item.number + 1));
  return { start, end, text: `\n${marker}` };
}

/**
 * Moves the item under the caret one level deeper or back, as Tab and Shift+Tab do. It takes the
 * marker of the list it joins.
 *
 * Args:
 *   value (string): Composer text.
 *   caret (number): Caret position.
 *   direction (1 | -1): Deeper or back.
 *
 * Returns:
 *   TextEdit | null: The edit to apply, or `null` when the item cannot move that way.
 */
export function indentItem(value: string, caret: number, direction: 1 | -1): TextEdit | null {
  const line = lineBounds(value, caret);
  const item = parse(value.slice(line.start, line.end));
  if (!item) {
    return null;
  }
  const level = item.level + direction;
  // Only an item below another one can nest: Tab keeps its meaning everywhere else.
  if (level < 0 || (direction === 1 && !sibling(value, line.start, item.level))) {
    return null;
  }
  const joined = sibling(value, line.start, level);
  const number = joined ? joined.number : item.number;
  const prefix =
    number === null
      ? bulletPrefix(level)
      : numberPrefix(level, joined ? number + 1 : 1, joined?.delimiter ?? item.delimiter);
  const inText = Math.max(0, caret - line.start - item.prefix.length);
  return {
    start: line.start,
    end: line.end,
    text: prefix + item.content,
    caretFromEnd: item.content.length - inText,
  };
}
