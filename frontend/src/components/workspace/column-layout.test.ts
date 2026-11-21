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

  it("pushes the other column down to its minimum, and remembers both widths", () => {
    const { result } = renderHook(() => useSideColumns(gridOf(1440), LEFT, RIGHT));
    expect(result.current[0].animate).toBe(false);
    // 1440 - 360 - 200 leaves 880, above the right column's own maximum.
    expect(result.current[1].maxWidth).toBe(800);

    act(() => result.current[0].resize(360));
    expect(result.current[0].animate).toBe(true);
    act(() => result.current[1].resize(9999));
    expect(result.current[1].width).toBe(800);
    expect(result.current[0].width).toBe(1440 - MIN_MAIN_WIDTH - 800);
    expect(window.localStorage.getItem("t.right.width")).toBe("800");
    expect(window.localStorage.getItem("t.left.width")).toBe("280");
    // The second resize interrupted the first one's animation: both jump instead.
    expect(result.current[0].animate).toBe(false);

    act(() => result.current[0].toggle());
    expect(result.current[0].collapsed).toBe(true);
    expect(result.current[0].animate).toBe(true);
    expect(window.localStorage.getItem("t.left.collapsed")).toBe("true");
  });

  it("gives the pushed column its width back when a drag returns, and saves on release", () => {
    const { result } = renderHook(() => useSideColumns(gridOf(1440), LEFT, RIGHT));
    act(() => result.current[0].resize(360));
    act(() => result.current[1].resize(540));
    window.localStorage.clear();

    act(() => result.current[1].startDrag());
    expect(result.current[1].animate).toBe(false);
    act(() => result.current[1].dragTo(800));
    expect(result.current[0].width).toBe(280);
    expect(window.localStorage.getItem("t.left.width")).toBeNull();
    act(() => result.current[1].dragTo(540));
    expect(result.current[0].width).toBe(360);
    act(() => result.current[1].endDrag());
    expect(window.localStorage.getItem("t.right.width")).toBe("540");
    expect(window.localStorage.getItem("t.left.width")).toBe("360");
  });

  it("ignores a key at a bound, which would only overwrite the other column", () => {
    window.localStorage.setItem("t.right.width", "800");
    const { result } = renderHook(() => useSideColumns(gridOf(1024), LEFT, RIGHT));
    act(() => result.current[0].resize(200));
    const shown = result.current[1].width;
    window.localStorage.removeItem("t.right.width");
    act(() => result.current[0].resize(200));
    expect(result.current[1].width).toBe(shown);
    expect(window.localStorage.getItem("t.right.width")).toBeNull();
  });

  it("widens a column that was shrunk to fit the window", () => {
    window.localStorage.setItem("t.left.width", "480");
    window.localStorage.setItem("t.right.width", "800");
    const { result } = renderHook(() => useSideColumns(gridOf(1024), LEFT, RIGHT));
    const [leftShown, rightShown] = [result.current[0].width, result.current[1].width];

    act(() => result.current[1].resize(rightShown + 16));
    expect(result.current[1].width).toBe(rightShown + 16);
    expect(result.current[0].width).toBe(
      Math.min(leftShown, 1024 - MIN_MAIN_WIDTH - rightShown - 16),
    );
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
