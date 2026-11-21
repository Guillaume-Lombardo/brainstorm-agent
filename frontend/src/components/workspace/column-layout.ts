"use client";

import {
  useLayoutEffect,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { flushSync } from "react-dom";

/** Width of a collapsed side column. */
export const RAIL_WIDTH = 48;
/** Width always left to the middle column on large screens. */
export const MIN_MAIN_WIDTH = 360;
/** Duration of the column width transition (`duration-300` in `CollapsibleColumn`). */
const TRANSITION_MS = 300;

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
  /** Whether width changes animate: only the user's toggles and resizes, one at a time. */
  animate: boolean;
  toggle: () => void;
  /** Sets the width, clamped to `[minWidth, maxWidth]`, and remembers it. */
  resize: (width: number) => void;
  /**
   * Starts a drag: widths follow `dragTo` without animation and are saved by `endDrag`.
   * Returns `false`, and starts nothing, while another drag is running.
   */
  startDrag: () => boolean;
  dragTo: (width: number) => void;
  endDrag: () => void;
  /** Whether this column's drag still runs: a new grid width or a toggle may have ended it. */
  isDragging: () => boolean;
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

/** Bookkeeping of the user's gestures. It never drives rendering, so it is not React state. */
class Gestures {
  /** When the last animated change started; `-Infinity` once nothing animates. */
  private animatedAt = -Infinity;
  /**
   * The running drag: the column it moves, the widths shown and preferred when it started,
   * and the last widths it set.
   */
  drag: {
    index: number;
    start: number[];
    startPreferences: number[];
    widths: Map<number, number>;
  } | null = null;

  /**
   * Whether a user change starting now may animate. Not when it interrupts one still running:
   * CSS would then retarget or shorten each column's transition differently, and their sum
   * could squeeze the middle column. Both columns jump to their new widths instead.
   *
   * Returns:
   *   boolean: `true` to animate the change.
   */
  startChange(): boolean {
    const now = performance.now();
    const interrupts = now - this.animatedAt < TRANSITION_MS;
    this.animatedAt = interrupts ? -Infinity : now;
    return !interrupts;
  }

  /** Records that widths now change without animation, which ends any running one. */
  stopAnimations() {
    this.animatedAt = -Infinity;
  }
}

/**
 * Ends the running drag, if any, and saves its widths. A drag that comes back to where it
 * started gives the columns back their preferences instead: the widths it showed may have
 * been shrunk to fit the window, and must not replace wider preferences.
 *
 * Args:
 *   gestures (Gestures): Gesture bookkeeping holding the drag.
 *   specs (ColumnSpec[]): Column settings, for their storage keys.
 *   setPreferences (Dispatch<SetStateAction<Preference[]>>): Preference state setter.
 */
function finishDrag(
  gestures: Gestures,
  specs: ColumnSpec[],
  setPreferences: Dispatch<SetStateAction<Preference[]>>,
) {
  const drag = gestures.drag;
  if (!drag) {
    return;
  }
  gestures.drag = null;
  const returned = [...drag.widths].every(([index, width]) => width === drag.start[index]);
  if (returned) {
    setPreferences((current) =>
      current.map((preference, index) => ({
        ...preference,
        width: drag.startPreferences[index],
      })),
    );
    return;
  }
  for (const [index, width] of drag.widths) {
    writeStored(`${specs[index].storageKey}.width`, String(width));
  }
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
  const [gestures] = useState(() => new Gestures());

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) {
      return;
    }
    let measured = grid.clientWidth;
    setGridWidth(measured);
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => {
      // Height changes (a banner above the grid) leave the columns alone.
      if (grid.clientWidth === measured) {
        return;
      }
      measured = grid.clientWidth;
      gestures.stopAnimations();
      // A new grid width (or layout mode) ends a drag: its pointer offsets no longer apply.
      finishDrag(gestures, [left, right], setPreferences);
      // Render the refit before the next paint, so the grid and the columns change together.
      flushSync(() => {
        setAnimate(false);
        setGridWidth(measured);
      });
    });
    observer.observe(grid);
    return () => observer.disconnect();
  }, [gridRef, gestures, left, right]);

  const columns = preferences.map((preference, index) => ({
    ...preference,
    minWidth: specs[index].minWidth,
  }));
  const widths = fitColumns(gridWidth, columns);

  function writeWidths(changes: Map<number, number>) {
    for (const [index, width] of changes) {
      writeStored(`${specs[index].storageKey}.width`, String(width));
    }
  }

  function applyWidths(changes: Map<number, number>) {
    setPreferences((current) =>
      current.map((preference, index) =>
        changes.has(index) ? { ...preference, width: changes.get(index)! } : preference,
      ),
    );
  }

  const layouts = specs.map((spec, index): ColumnLayout => {
    const other = 1 - index;
    const otherCollapsed = preferences[other].collapsed;
    // Room for this column once the other one is pushed to its minimum (or is a rail).
    const room = gridWidth - MIN_MAIN_WIDTH - (otherCollapsed ? RAIL_WIDTH : specs[other].minWidth);
    const maxWidth = gridWidth === 0 ? spec.maxWidth : clamp(room, spec.minWidth, spec.maxWidth);

    /**
     * Widths after setting this column to `width`. The other column keeps `otherWidth` (what
     * it showed), minus what this one now takes. A width already shown changes nothing.
     */
    function widthsFor(width: number, otherWidth: number): Map<number, number> {
      const next = clamp(Math.round(width), spec.minWidth, maxWidth);
      const changes = new Map<number, number>();
      if (next === widths[index]) {
        // Already shown: its preference may be wider, shrunk to fit the window. Keep it.
        return changes;
      }
      if (next !== preferences[index].width) {
        changes.set(index, next);
      }
      if (gridWidth > 0 && !otherCollapsed) {
        const pushed = Math.max(
          specs[other].minWidth,
          Math.min(otherWidth, gridWidth - MIN_MAIN_WIDTH - next),
        );
        if (pushed !== preferences[other].width) {
          changes.set(other, pushed);
        }
      }
      return changes;
    }

    return {
      collapsed: preferences[index].collapsed,
      width: widths[index],
      minWidth: spec.minWidth,
      maxWidth,
      defaultWidth: Math.min(spec.defaultWidth, maxWidth),
      animate,
      toggle() {
        const collapsed = !preferences[index].collapsed;
        // Ending a drag first: the dragged column jumps, so this change must not animate.
        const dragging = gestures.drag !== null;
        finishDrag(gestures, specs, setPreferences);
        setAnimate(!dragging && gestures.startChange());
        setPreferences((current) =>
          current.map((preference, at) =>
            at === index ? { ...preference, collapsed } : preference,
          ),
        );
        writeStored(`${spec.storageKey}.collapsed`, String(collapsed));
      },
      resize(width) {
        // Keys and double clicks wait for the pointer: the drag owns the widths until released.
        if (gestures.drag) {
          return;
        }
        const changes = widthsFor(width, widths[other]);
        if (changes.size > 0) {
          if (clamp(Math.round(width), spec.minWidth, maxWidth) !== widths[index]) {
            setAnimate(gestures.startChange());
          }
          applyWidths(changes);
          writeWidths(changes);
        }
      },
      startDrag() {
        if (gestures.drag) {
          return false;
        }
        gestures.stopAnimations();
        setAnimate(false);
        gestures.drag = {
          index,
          start: [...widths],
          startPreferences: preferences.map((preference) => preference.width),
          widths: new Map(),
        };
        return true;
      },
      dragTo(width) {
        const current = gestures.drag;
        if (current?.index !== index) {
          return;
        }
        // The other column is pushed from where it was when the drag started, so it gets its
        // width back when this one comes back.
        const changes = widthsFor(width, current.start[other]);
        for (const [at, value] of changes) {
          current.widths.set(at, value);
        }
        applyWidths(changes);
      },
      endDrag() {
        if (gestures.drag?.index === index) {
          finishDrag(gestures, specs, setPreferences);
        }
      },
      isDragging() {
        return gestures.drag?.index === index;
      },
    };
  });
  return [layouts[0], layouts[1]];
}
