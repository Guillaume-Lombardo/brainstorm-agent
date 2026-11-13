import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DiffView } from "./diff-view";

const DIFF = [
  "--- stage_0_pitch v1",
  "+++ stage_0_pitch v2",
  "@@ -1,3 +1,3 @@",
  " # Pitch",
  "-- one",
  "+- two",
  "----",
  "",
].join("\n");

describe("DiffView", () => {
  it("renders the backend diff, marking added and removed lines", () => {
    render(<DiffView diff={DIFF} />);
    const diff = screen.getByTestId("diff-view");
    expect(diff).not.toHaveTextContent("stage_0_pitch v1");
    expect(screen.getByText("-- one")).toHaveClass("line-through");
    expect(screen.getByText("+- two")).toHaveClass("text-emerald-800");
    // A removed horizontal rule inside the hunk is a change, not a header.
    expect(screen.getByText("----")).toHaveClass("line-through");
  });

  it("says when nothing changed", () => {
    render(<DiffView diff="" />);
    expect(screen.getByText("No change between these versions.")).toBeInTheDocument();
  });
});
