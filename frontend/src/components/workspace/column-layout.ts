"use client";

import { useLayoutEffect, useState, type RefObject } from "react";
import { flushSync } from "react-dom";

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
  /** Largest width the column can take now, pushing the other one to its minimum. */
  maxWidth: number;
  defaultWidth: number;
  /** Whether width changes should animate: only after the user's own toggles and resizes. */
  animate: boolean;
  toggle: () => void;
  /**
   * Sets the width, clamped to `[minWidth, maxWidth]`, and remembers it. `animate: false`
   * for a drag, which follows the pointer.
   */
  resize: (width: number, options?: { animate?: boolean }) => void;
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
 * widths shrink when the window narrows and grow back (up to the preferences) when it widens;
 * those refits apply at once, without animation, so the middle column never gets squeezed
 * while the columns catch up. Widening a column pushes the other one, down to its minimum;
 * after an explicit resize both columns remember the widths they show.
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
  // Only changes the user asks for animate: not the first fit nor refits to the window.
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) {
      return;
    }
    setGridWidth(grid.clientWidth);
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => {
      // Render the refit before the next paint, so the grid and the columns change together.
      flushSync(() => {
        setAnimate(false);
        setGridWidth(grid.clientWidth);
      });
    });
    observer.observe(grid);
    return () => observer.disconnect();
  }, [gridRef]);

  const columns = preferences.map((preference, index) => ({
    ...preference,
    minWidth: specs[index].minWidth,
  }));
  const widths = fitColumns(gridWidth, columns);

  function save(changes: Map<number, Partial<Preference>>) {
    setPreferences((current) =>
      current.map((preference, index) => ({ ...preference, ...changes.get(index) })),
    );
    for (const [index, change] of changes) {
      const { storageKey } = specs[index];
      if (change.collapsed !== undefined) {
        writeStored(`${storageKey}.collapsed`, String(change.collapsed));
      }
      if (change.width !== undefined) {
        writeStored(`${storageKey}.width`, String(change.width));
      }
    }
  }

  const layouts = specs.map((spec, index): ColumnLayout => {
    const other = 1 - index;
    const otherCollapsed = preferences[other].collapsed;
    // Room for this column once the other one is pushed to its minimum (or is a rail).
    const room = gridWidth - MIN_MAIN_WIDTH - (otherCollapsed ? RAIL_WIDTH : specs[other].minWidth);
    const maxWidth = gridWidth === 0 ? spec.maxWidth : clamp(room, spec.minWidth, spec.maxWidth);
    return {
      collapsed: preferences[index].collapsed,
      width: widths[index],
      minWidth: spec.minWidth,
      maxWidth,
      defaultWidth: Math.min(spec.defaultWidth, maxWidth),
      animate,
      toggle() {
        setAnimate(true);
        save(new Map([[index, { collapsed: !preferences[index].collapsed }]]));
      },
      resize(width, options = {}) {
        setAnimate(options.animate ?? true);
        const next = clamp(Math.round(width), spec.minWidth, maxWidth);
        const changes = new Map<number, Partial<Preference>>([[index, { width: next }]]);
        if (gridWidth > 0 && !otherCollapsed) {
          // The other column keeps the width it shows, minus what this one now takes.
          const available = gridWidth - MIN_MAIN_WIDTH - next;
          const otherWidth = Math.max(specs[other].minWidth, Math.min(widths[other], available));
          if (otherWidth !== preferences[other].width) {
            changes.set(other, { width: otherWidth });
          }
        }
        save(changes);
      },
    };
  });
  return [layouts[0], layouts[1]];
}
