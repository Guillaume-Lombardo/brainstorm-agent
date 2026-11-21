import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { CollapsibleColumn } from "./collapsible-column";

const KEY = "workspace.test-panel.collapsed";

function renderColumn(side: "left" | "right") {
  return render(
    <CollapsibleColumn side={side} name="test" panelId="test-panel" storageKey={KEY} width={300}>
      <p>Content</p>
    </CollapsibleColumn>,
  );
}

describe("CollapsibleColumn", () => {
  afterEach(() => window.localStorage.clear());

  it("collapses and expands the panel and remembers the choice", async () => {
    const { unmount } = renderColumn("left");
    const toggle = screen.getByRole("button", { name: "Collapse test panel" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("aria-controls", "test-panel");
    expect(screen.getByText("Content").closest("#test-panel")).not.toBeNull();

    await userEvent.click(toggle);
    expect(toggle).toHaveAccessibleName("Expand test panel");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Content").closest("aside")).toHaveAttribute("data-collapsed", "true");
    expect(window.localStorage.getItem(KEY)).toBe("true");

    unmount();
    renderColumn("left");
    await userEvent.click(screen.getByRole("button", { name: "Expand test panel" }));
    expect(window.localStorage.getItem(KEY)).toBe("false");
    expect(screen.getByRole("button", { name: "Collapse test panel" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("puts the border and the toggle on the inner side of a right column", () => {
    renderColumn("right");
    const column = screen.getByText("Content").closest("aside")!;
    expect(column).toHaveAttribute("data-side", "right");
    expect(column).toHaveClass("border-l");
    expect(column.style.getPropertyValue("--open-width")).toBe("300px");
    expect(screen.getByRole("button", { name: "Collapse test panel" })).toHaveClass("left-2");
  });
});
