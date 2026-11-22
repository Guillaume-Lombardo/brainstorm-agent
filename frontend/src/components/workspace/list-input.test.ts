import { describe, expect, it } from "vitest";

import { continueList, detectList, indentItem, type TextEdit } from "./list-input";

function applied(value: string, edit: TextEdit | null): string | null {
  return edit && value.slice(0, edit.start) + edit.text + value.slice(edit.end);
}

describe("detectList", () => {
  const typed = (value: string) => applied(value, detectList(value, value.length));

  it("turns a typed bullet marker into a bullet", () => {
    expect(typed("* ")).toBe("• ");
    expect(typed("Intro\n- ")).toBe("Intro\n• ");
  });

  it("reads leading spaces as nesting levels", () => {
    expect(typed("• milk\n  * ")).toBe("• milk\n  ◦ ");
    expect(typed("• milk\n * ")).toBe("• milk\n  ◦ ");
    expect(typed("• milk\n  ◦ whole\n    * ")).toBe("• milk\n  ◦ whole\n    ▪ ");
    expect(typed("1. milk\n 1. ")).toBe("1. milk\n  1. ");
  });

  it("starts a numbered list at the typed number, and follows the list above", () => {
    expect(typed("4. ")).toBeNull();
    expect(typed("1. milk\n\n4. ")).toBeNull();
    expect(typed("4. milk\n1. ")).toBe("4. milk\n5. ");
    expect(typed("1. milk\n  • whole\n9. ")).toBe("1. milk\n  • whole\n2. ");
    expect(typed("• milk\n4. ")).toBeNull();
  });

  it("ignores markers inside a line and plain text", () => {
    expect(typed("2 * ")).toBeNull();
    expect(typed("see 1. ")).toBeNull();
    expect(typed("*bold* ")).toBeNull();
    expect(detectList("* milk", 6)).toBeNull();
  });
});

describe("continueList", () => {
  it("starts the next bullet or number with the same marker and indent", () => {
    expect(applied("• milk", continueList("• milk", 6, 6))).toBe("• milk\n• ");
    expect(applied("- milk", continueList("- milk", 6, 6))).toBe("- milk\n- ");
    expect(applied("4. milk", continueList("4. milk", 7, 7))).toBe("4. milk\n5. ");
    expect(applied("Intro\n  2) eggs", continueList("Intro\n  2) eggs", 15, 15))).toBe(
      "Intro\n  2) eggs\n  3) ",
    );
  });

  it("leaves the list on an empty item, one level at a time", () => {
    expect(applied("1. milk\n2. ", continueList("1. milk\n2. ", 11, 11))).toBe("1. milk\n");
    const nested = "1. milk\n  ◦ whole\n  ◦ ";
    expect(applied(nested, continueList(nested, nested.length, nested.length))).toBe(
      "1. milk\n  ◦ whole\n2. ",
    );
  });

  it("replaces a selection inside an item and ignores plain lines", () => {
    expect(applied("• milk eggs", continueList("• milk eggs", 6, 7))).toBe("• milk\n• eggs");
    expect(continueList("• milk\nmore", 2, 9)).toBeNull();
    expect(continueList("1. milk", 0, 7)).toBeNull();
    expect(continueList("1. milk", 1, 1)).toBeNull();
    expect(continueList("Hello", 5, 5)).toBeNull();
    expect(continueList("-5 degrees", 10, 10)).toBeNull();
  });
});

describe("indentItem", () => {
  it("nests an item under the one above and moves it back", () => {
    expect(applied("1. milk\n2. whole", indentItem("1. milk\n2. whole", 14, 1))).toBe(
      "1. milk\n  1. whole",
    );
    expect(indentItem("1. milk\n2. whole", 14, 1)).toMatchObject({ caretFromEnd: 2 });
    const nested = "1. milk\n  ◦ whole\n  ◦ skimmed";
    expect(applied(nested, indentItem(nested, nested.length, -1))).toBe(
      "1. milk\n  ◦ whole\n2. skimmed",
    );
    const deeper = "• milk\n  ◦ whole\n• eggs";
    expect(applied(deeper, indentItem(deeper, deeper.length, 1))).toBe(
      "• milk\n  ◦ whole\n  ◦ eggs",
    );
  });

  it("leaves the first item, a top level item moved back and plain text alone", () => {
    expect(indentItem("1. milk", 7, 1)).toBeNull();
    expect(indentItem("1. milk", 7, -1)).toBeNull();
    expect(indentItem("• milk\n  ◦ whole", 16, 1)).toBeNull();
    expect(indentItem("Hello", 5, 1)).toBeNull();
  });
});
