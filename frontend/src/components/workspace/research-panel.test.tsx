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

const benchmark = (selected_ids: string[]) => ({
  id: "b1",
  version: 1,
  queries: ["tricount alternative"],
  results: [],
  selected_ids,
  synthesis: {
    products: [
      {
        name: "Spliit",
        url: "https://spliit.app",
        summary: "Open source expense sharing.",
        key_features: ["Groups"],
        pricing: "Free",
        evidence_urls: [],
      },
    ],
    features: [
      {
        id: "f1",
        feature: "Share link",
        recommendation: "adopt",
        products: ["Spliit"],
        justification: "No account needed.",
      },
    ],
  },
});

it("collapses the benchmark once the selected features are validated", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ enabled: true, benchmarks: [benchmark([])] }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(Response.json({ enabled: true, benchmarks: [benchmark(["f1"])] }));
  vi.stubGlobal("fetch", fetcher);
  const changed = vi.fn().mockResolvedValue(undefined);
  render(<ResearchPanel sessionId="one" available disabled={false} onChanged={changed} />);
  await userEvent.click(await screen.findByRole("checkbox"));
  await userEvent.click(
    screen.getByRole("button", { name: "Valider les fonctionnalités retenues" }),
  );
  expect(await screen.findByText(/1 fonctionnalité retenue/)).toBeVisible();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.queryByText("Spliit")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Afficher le benchmark" }));
  expect(screen.getByRole("checkbox")).toBeChecked();
});

it("starts collapsed when the latest benchmark already has a validated selection", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ enabled: true, benchmarks: [benchmark(["f1"])] })),
  );
  render(<ResearchPanel sessionId="one" available disabled={false} onChanged={vi.fn()} />);
  expect(await screen.findByRole("button", { name: "Afficher le benchmark" })).toBeVisible();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});
