import { describe, expect, it } from "vitest";

import { continueList, toggleList, type TextEdit } from "./list-input";

function applied(value: string, edit: TextEdit | null): string | null {
  return edit && value.slice(0, edit.start) + edit.text + value.slice(edit.end);
}

describe("continueList", () => {
  it("starts the next bullet or number with the same marker and indent", () => {
    expect(applied("• milk", continueList("• milk", 6, 6))).toBe("• milk\n• ");
    expect(applied("- milk", continueList("- milk", 6, 6))).toBe("- milk\n- ");
    expect(applied("Intro\n  2) eggs", continueList("Intro\n  2) eggs", 15, 15))).toBe(
      "Intro\n  2) eggs\n  3) ",
    );
  });

  it("leaves the list on an empty item", () => {
    expect(applied("1. milk\n2. ", continueList("1. milk\n2. ", 11, 11))).toBe("1. milk\n");
  });

  it("replaces a selection inside an item and ignores plain lines", () => {
    expect(applied("• milk eggs", continueList("• milk eggs", 6, 7))).toBe("• milk\n• eggs");
    expect(continueList("• milk\nmore", 2, 9)).toBeNull();
    expect(continueList("Hello", 5, 5)).toBeNull();
    expect(continueList("-5 degrees", 10, 10)).toBeNull();
  });
});

describe("toggleList", () => {
  it("turns the selected lines into a list and back", () => {
    const value = "Before\nmilk\neggs";
    const numbered = applied(value, toggleList(value, 8, 15, "numbered"))!;
    expect(numbered).toBe("Before\n1. milk\n2. eggs");
    expect(applied(numbered, toggleList(numbered, 9, 20, "numbered"))).toBe("Before\nmilk\neggs");
    expect(applied(numbered, toggleList(numbered, 9, 20, "bullet"))).toBe("Before\n• milk\n• eggs");
  });

  it("keeps several toggled lines selected, and stops at a selection ending on a line start", () => {
    expect(toggleList("milk\neggs", 0, 9, "bullet")).toMatchObject({ select: true });
    expect(applied("milk\neggs", toggleList("milk\neggs", 0, 5, "bullet"))).toBe("• milk\neggs");
  });

  it("starts a bullet on an empty composer or an empty first line", () => {
    expect(applied("", toggleList("", 0, 0, "bullet"))).toBe("• ");
    expect(applied("\nmilk", toggleList("\nmilk", 0, 0, "numbered"))).toBe("1. \nmilk");
  });
});
