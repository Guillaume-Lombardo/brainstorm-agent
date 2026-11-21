"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

/** Width of a collapsed side column. */
export const RAIL_WIDTH = 48;
/** Width always left to the middle column on large screens. */
export const MIN_MAIN_WIDTH = 360;

/** Fixed settings of a side column. */
export interface ColumnSpec {
  /** `localStorage` prefix: `<prefix>.collapsed` and `<prefix>.width` remember the layout. */
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
}

/** What a side column needs to render, from `useSideColumns`. */
export interface ColumnLayout {
  collapsed: boolean;
  /** Width shown when open: the preferred width, reduced to fit the grid. */
  width: number;
  minWidth: number;
  /** Largest width the column can take now without squeezing the middle column. */
  maxWidth: number;
  defaultWidth: number;
  toggle: () => void;
  /** Sets the preferred width, clamped to `[minWidth, maxWidth]`, and remembers it. */
  resize: (width: number) => void;
}

interface Preference {
  collapsed: boolean;
  width: number;
}

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable (private mode); the layout still works for this page.
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function readPreference(spec: ColumnSpec): Preference {
  const stored = Number(readStored(`${spec.storageKey}.width`));
  return {
    collapsed: readStored(`${spec.storageKey}.collapsed`) === "true",
    width: stored ? clamp(Math.round(stored), spec.minWidth, spec.maxWidth) : spec.defaultWidth,
  };
}

/**
 * Open widths of the side columns that fit a grid while leaving `MIN_MAIN_WIDTH` to the middle.
 *
 * Preferred widths are kept when they fit. Otherwise each open column gives up part of its
 * width above its minimum, in proportion to that slack. Collapsed columns count as rails.
 *
 * Args:
 *   gridWidth (number): Grid width in pixels; `0` when unknown, which keeps the preferences.
 *   columns (Array<{ width: number; minWidth: number; collapsed: boolean }>): Preferred open
 *     width, minimum and state of each side column.
 *
 * Returns:
 *   number[]: The open width to show for each column, in the same order.
 */
export function fitColumns(
  gridWidth: number,
  columns: { width: number; minWidth: number; collapsed: boolean }[],
): number[] {
  const widths = columns.map((column) => column.width);
  if (gridWidth === 0) {
    return widths;
  }
  const available =
    gridWidth -
    MIN_MAIN_WIDTH -
    columns.reduce((total, column) => total + (column.collapsed ? RAIL_WIDTH : 0), 0);
  const open = columns.filter((column) => !column.collapsed);
  const excess = open.reduce((total, column) => total + column.width, 0) - available;
  if (excess <= 0) {
    return widths;
  }
  const slack = open.reduce((total, column) => total + column.width - column.minWidth, 0);
  return columns.map((column) =>
    column.collapsed || slack === 0
      ? column.width
      : Math.max(
          column.minWidth,
          Math.floor(column.width - (excess * (column.width - column.minWidth)) / slack),
        ),
  );
}

/**
 * Collapsed state and widths of the two workspace side columns, fitted to their grid.
 *
 * Preferences come from and go to `localStorage`. The grid width is observed, so the shown
 * widths shrink when the window narrows and grow back (up to the preferences) when it widens.
 *
 * Args:
 *   gridRef (RefObject<HTMLElement | null>): The grid holding both columns and the middle one.
 *   left (ColumnSpec): Left column settings.
 *   right (ColumnSpec): Right column settings.
 *
 * Returns:
 *   [ColumnLayout, ColumnLayout]: Layout of the left and right columns.
 */
export function useSideColumns(
  gridRef: RefObject<HTMLElement | null>,
  left: ColumnSpec,
  right: ColumnSpec,
): [ColumnLayout, ColumnLayout] {
  const specs = [left, right];
  const [preferences, setPreferences] = useState(() => specs.map(readPreference));
  const [gridWidth, setGridWidth] = useState(0);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) {
      return;
    }
    setGridWidth(grid.clientWidth);
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => setGridWidth(grid.clientWidth));
    observer.observe(grid);
    return () => observer.disconnect();
  }, [gridRef]);

  const columns = preferences.map((preference, index) => ({
    ...preference,
    minWidth: specs[index].minWidth,
  }));
  const widths = fitColumns(gridWidth, columns);

  function update(index: number, change: Partial<Preference>) {
    setPreferences((current) =>
      current.map((preference, at) => (at === index ? { ...preference, ...change } : preference)),
    );
  }

  const layouts = specs.map((spec, index): ColumnLayout => {
    const other = 1 - index;
    const otherWidth = preferences[other].collapsed ? RAIL_WIDTH : widths[other];
    const maxWidth =
      gridWidth === 0
        ? spec.maxWidth
        : clamp(gridWidth - MIN_MAIN_WIDTH - otherWidth, spec.minWidth, spec.maxWidth);
    return {
      collapsed: preferences[index].collapsed,
      width: widths[index],
      minWidth: spec.minWidth,
      maxWidth,
      defaultWidth: Math.min(spec.defaultWidth, maxWidth),
      toggle() {
        const collapsed = !preferences[index].collapsed;
        update(index, { collapsed });
        writeStored(`${spec.storageKey}.collapsed`, String(collapsed));
      },
      resize(width) {
        const next = clamp(Math.round(width), spec.minWidth, maxWidth);
        update(index, { width: next });
        writeStored(`${spec.storageKey}.width`, String(next));
      },
    };
  });
  return [layouts[0], layouts[1]];
}
