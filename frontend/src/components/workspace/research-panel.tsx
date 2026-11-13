"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { components } from "@/lib/backend/generated/api";
type Benchmark = components["schemas"]["Benchmark"];

/** Optional, explicitly triggered snippet benchmark. */
export function ResearchPanel({
  sessionId,
  available,
  disabled,
  onChanged,
}: {
  sessionId: string;
  available: boolean;
  disabled: boolean;
  onChanged: () => Promise<void>;
}) {
  const [enabled, setEnabled] = useState(false);
  const [history, setHistory] = useState<Benchmark[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const base = `/api/backend/sessions/${encodeURIComponent(sessionId)}/research`;
  async function load() {
    const response = await fetch(base);
    if (!response.ok) throw new Error("Impossible de lire les recherches.");
    const data = (await response.json()) as { enabled: boolean; benchmarks: Benchmark[] };
    setEnabled(data.enabled);
    setHistory(data.benchmarks);
    setSelected(data.benchmarks.at(-1)?.selected_ids ?? []);
  }
  useEffect(() => {
    let active = true;
    if (available)
      fetch(base)
        .then(async (response) => {
          if (!response.ok) throw new Error("Impossible de lire les recherches.");
          const data = (await response.json()) as { enabled: boolean; benchmarks: Benchmark[] };
          if (active) {
            setEnabled(data.enabled);
            setHistory(data.benchmarks);
            setSelected(data.benchmarks.at(-1)?.selected_ids ?? []);
            setCollapsed(Boolean(data.benchmarks.at(-1)?.selected_ids?.length));
          }
        })
        .catch(() => {
          if (active) setError("Impossible de lire les recherches.");
        });
    return () => {
      active = false;
    };
  }, [base, available]);
  if (!available || (!enabled && !error)) return null;
  const latest = history.at(-1);
  if (latest && collapsed) {
    const count = latest.selected_ids?.length ?? 0;
    return (
      <section
        className="flex shrink-0 items-center justify-between gap-3 border-b p-3"
        aria-label="Benchmark"
      >
        <p className="text-sm">
          Benchmark — version {latest.version} ·{" "}
          {count === 0
            ? "aucune fonctionnalité retenue"
            : `${count} fonctionnalité${count > 1 ? "s retenues" : " retenue"}`}
        </p>
        <Button variant="outline" aria-expanded={false} onClick={() => setCollapsed(false)}>
          Afficher le benchmark
        </Button>
      </section>
    );
  }
  async function run() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(base, { method: "POST" });
      if (!response.ok) throw new Error("Recherche indisponible.");
      const events = await response.text();
      if (!events.includes("event: research.completed"))
        throw new Error("La recherche a échoué. Réessayez.");
      await load();
      setCollapsed(false);
      await onChanged();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Recherche indisponible.");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!latest) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${base}/${latest.id}/selection`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ selected_ids: selected }),
      });
      if (!response.ok) throw new Error("Impossible d’enregistrer la sélection.");
      await load();
      setCollapsed(true);
      await onChanged();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Erreur de sélection.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="max-h-[45vh] shrink-0 space-y-3 overflow-y-auto border-b p-3"
      aria-label="Benchmark"
    >
      <div className="flex flex-wrap gap-2">
        <Button disabled={disabled || busy || !enabled} onClick={() => void run()}>
          Rechercher des produits similaires
        </Button>
        {latest && (
          <Button variant="outline" aria-expanded onClick={() => setCollapsed(true)}>
            Replier le benchmark
          </Button>
        )}
      </div>
      {busy && <p role="status">Recherche ou enregistrement en cours…</p>}
      {error && <p role="alert">{error}</p>}
      {!latest && <p>Aucune recherche effectuée.</p>}
      {latest && (
        <>
          <p>
            Benchmark — version {latest.version} ({history.length} recherches)
          </p>
          {!latest.synthesis.products.length && <p>Aucun produit sourcé trouvé.</p>}
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th>Produit</th>
                <th>Fonctionnalités et prix</th>
              </tr>
            </thead>
            <tbody>
              {latest.synthesis.products.map((product) => (
                <tr key={product.url}>
                  <td>
                    <a
                      href={product.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      {product.name}
                    </a>
                    <p>{product.summary}</p>
                    {product.evidence_urls.map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block underline"
                      >
                        Source
                      </a>
                    ))}
                  </td>
                  <td>
                    {product.key_features.join(", ")}
                    <p>{product.pricing ?? "Prix inconnu"}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>Recommandations : hypothèses à confirmer.</p>
          {latest.synthesis.features.map((feature) => {
            const id = feature.id;
            if (!id) return null;
            return (
              <label key={id} className="block">
                <input
                  type="checkbox"
                  disabled={disabled || busy}
                  checked={selected.includes(id)}
                  onChange={(event) =>
                    setSelected(
                      event.target.checked
                        ? [...selected, id]
                        : selected.filter((value) => value !== id),
                    )
                  }
                />
                {feature.feature} —{" "}
                {{ adopt: "Reprendre", adapt: "Adapter", skip: "Écarter" }[feature.recommendation]}
                <p>
                  {feature.products.join(", ")} : {feature.justification}
                </p>
              </label>
            );
          })}
          <Button disabled={disabled || busy} onClick={() => void save()}>
            Valider les fonctionnalités retenues
          </Button>
        </>
      )}
    </section>
  );
}
