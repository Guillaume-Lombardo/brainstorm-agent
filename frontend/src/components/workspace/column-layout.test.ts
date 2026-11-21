import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { fitColumns, MIN_MAIN_WIDTH, useSideColumns, type ColumnSpec } from "./column-layout";

const LEFT: ColumnSpec = { storageKey: "t.left", defaultWidth: 260, minWidth: 200, maxWidth: 480 };
const RIGHT: ColumnSpec = {
  storageKey: "t.right",
  defaultWidth: 440,
  minWidth: 320,
  maxWidth: 800,
};

function gridOf(width: number) {
  const grid = document.createElement("div");
  Object.defineProperty(grid, "clientWidth", { value: width });
  return { current: grid };
}

describe("fitColumns", () => {
  const open = (width: number, minWidth: number) => ({ width, minWidth, collapsed: false });

  it("keeps preferred widths that fit, or when the grid is not measured", () => {
    expect(fitColumns(1440, [open(260, 200), open(440, 320)])).toEqual([260, 440]);
    expect(fitColumns(0, [open(480, 200), open(800, 320)])).toEqual([480, 800]);
  });

  it("shares the shortfall in proportion to each column's slack", () => {
    // 1024 - 360 leaves 664 for 480 + 800: 616 too many, slack 280 + 480.
    const widths = fitColumns(1024, [open(480, 200), open(800, 320)]);
    expect(widths[0] + widths[1]).toBeLessThanOrEqual(1024 - MIN_MAIN_WIDTH);
    expect(widths).toEqual([253, 410]);
  });

  it("counts a collapsed column as a rail and never goes below the minimums", () => {
    expect(
      fitColumns(1024, [{ width: 480, minWidth: 200, collapsed: true }, open(800, 320)]),
    ).toEqual([480, 1024 - MIN_MAIN_WIDTH - 48]);
    expect(fitColumns(600, [open(480, 200), open(800, 320)])).toEqual([200, 320]);
  });
});

describe("useSideColumns", () => {
  afterEach(() => window.localStorage.clear());

  it("limits a column to the room the other one leaves, and remembers preferences", () => {
    const { result } = renderHook(() => useSideColumns(gridOf(1440), LEFT, RIGHT));
    // 1440 - 360 - 260 leaves 820, above the column's own maximum.
    expect(result.current[1].maxWidth).toBe(800);

    act(() => result.current[1].resize(9999));
    expect(result.current[1].width).toBe(800);
    expect(result.current[0].maxWidth).toBe(1440 - MIN_MAIN_WIDTH - 800);
    expect(window.localStorage.getItem("t.right.width")).toBe("800");

    act(() => result.current[0].toggle());
    expect(result.current[0].collapsed).toBe(true);
    expect(window.localStorage.getItem("t.left.collapsed")).toBe("true");
  });

  it("shrinks stored widths that no longer fit, without forgetting them", () => {
    window.localStorage.setItem("t.left.width", "480");
    window.localStorage.setItem("t.right.width", "800");
    const { result } = renderHook(() => useSideColumns(gridOf(1024), LEFT, RIGHT));
    expect(result.current[0].width + result.current[1].width).toBeLessThanOrEqual(
      1024 - MIN_MAIN_WIDTH,
    );
    expect(window.localStorage.getItem("t.right.width")).toBe("800");
  });
});
