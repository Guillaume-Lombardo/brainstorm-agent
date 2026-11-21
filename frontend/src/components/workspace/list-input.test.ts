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

  it("ignores plain lines and selections", () => {
    expect(continueList("Hello", 5, 5)).toBeNull();
    expect(continueList("-5 degrees", 10, 10)).toBeNull();
    expect(continueList("• milk", 0, 6)).toBeNull();
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

  it("starts a bullet on an empty composer", () => {
    expect(applied("", toggleList("", 0, 0, "bullet"))).toBe("• ");
  });
});
