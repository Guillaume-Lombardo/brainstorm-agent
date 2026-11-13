import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import type { DeliverySlice } from "@/lib/backend/types";
import { fieldsFixture, SLICES, sessionFixture, stageStateFixture } from "@/test/fixtures";

import { DeliverySlicingView, DeliveryView } from "./delivery-view";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DeliveryView", () => {
  it("shows the dependencies the validated plan resolved, not the draft ones", async () => {
    const draft: DeliverySlice[] = [
      { id: "slice-0", goal: "Walking skeleton" },
      { id: "S1", goal: "Shopping list" },
    ];
    vi.spyOn(api, "getDeliveryPlan").mockResolvedValue({
      backlog: {} as never,
      slices: [
        { ...draft[0], wave: 0 },
        { ...draft[1], wave: 1, dependencies: ["slice-0"] },
      ],
      waves: [["slice-0"], ["S1"]],
    });
    const session = sessionFixture({
      current_stage: "stage_7_delivery_slicing",
      stage_states: {
        stage_7_delivery_slicing: stageStateFixture("stage_7_delivery_slicing", {
          extracted_fields: fieldsFixture("stage_7_delivery_slicing", { slices: draft }),
        }),
      },
    });
    render(<DeliveryView session={session} revision={0} />);
    expect(await screen.findByText("Wave 1")).toBeInTheDocument();
    expect(screen.getByTestId("slice-S1")).toHaveTextContent("Depends on: slice-0");
  });
});

describe("DeliverySlicingView", () => {
  it("renders slice cards, one graph node per slice and the contract matrix", () => {
    render(<DeliverySlicingView slices={SLICES} waves={[["S1"], ["S2"], ["S3"]]} />);
    expect(screen.getByTestId("slice-S2")).toHaveTextContent("Shopping list");
    expect(screen.getByTestId("slice-S2")).toHaveTextContent("a planned week");
    expect(screen.getByTestId("slice-S1")).toHaveTextContent(
      "WHEN a week is planned THE SYSTEM SHALL store it",
    );
    for (const slice of SLICES) {
      expect(screen.getByTestId(`graph-node-${slice.id}`)).toBeInTheDocument();
    }
    expect(screen.getByText("Wave 2")).toBeInTheDocument();
    const matrix = screen.getByRole("table", { name: "Contract matrix" });
    const plan = within(matrix).getByRole("row", { name: /C1 Plan API/ });
    const cells = within(plan).getAllByRole("cell");
    expect(cells.map((cell) => cell.textContent)).toEqual(["O", "C", ""]);
  });

  it("shows the notice instead of waves while the plan is not validated", () => {
    render(<DeliverySlicingView slices={SLICES} waves={null} notice="Waves appear later." />);
    expect(screen.getByText("Waves appear later.")).toBeInTheDocument();
    expect(screen.queryByText("Wave 0")).not.toBeInTheDocument();
  });
});
