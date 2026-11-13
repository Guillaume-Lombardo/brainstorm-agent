import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DiffView } from "./diff-view";

describe("DiffView", () => {
  it("marks added and removed lines", () => {
    render(<DiffView before={"# A\n- one\n"} after={"# A\n- two\n"} />);
    const diff = screen.getByTestId("diff-view");
    expect(diff).toHaveTextContent("- - one");
    expect(diff).toHaveTextContent("+ - two");
  });

  it("says when nothing changed", () => {
    render(<DiffView before="same" after="same" />);
    expect(screen.getByText("No change between these versions.")).toBeInTheDocument();
  });
});
