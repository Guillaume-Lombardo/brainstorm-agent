import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ResearchPanel } from "./research-panel";

afterEach(() => vi.unstubAllGlobals());

it("hides the control when search is disabled", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ enabled: false, benchmarks: [] }));
  vi.stubGlobal("fetch", fetcher);
  render(<ResearchPanel sessionId="one" available disabled={false} onChanged={vi.fn()} />);
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalled());
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("shows empty research and a provider error without adding decisions", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ enabled: true, benchmarks: [] }))
    .mockResolvedValueOnce(new Response("event: error\ndata: {}\n\n"));
  vi.stubGlobal("fetch", fetcher);
  const changed = vi.fn();
  render(<ResearchPanel sessionId="one" available disabled={false} onChanged={changed} />);
  expect(await screen.findByText("Aucune recherche effectuée.")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Rechercher des produits similaires" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("La recherche a échoué");
  expect(changed).not.toHaveBeenCalled();
});
