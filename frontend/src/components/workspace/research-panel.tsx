"use client";

import { ChevronDownIcon, ChevronUpIcon, LoaderCircleIcon, SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { useMessages } from "@/components/preferences/provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { components } from "@/lib/backend/generated/api";

type Benchmark = components["schemas"]["Benchmark"];

/** Error texts of the panel, by key of `messages.research`. */
type ResearchError = "unreadable" | "unavailable" | "failed" | "saveFailed";

const RECOMMENDATION_BADGE = { adopt: "good", adapt: "accent", skip: "muted" } as const;

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
  const t = useMessages().research;
  const [enabled, setEnabled] = useState(false);
  const [history, setHistory] = useState<Benchmark[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ResearchError | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const base = `/api/backend/sessions/${encodeURIComponent(sessionId)}/research`;
  async function load() {
    const response = await fetch(base);
    if (!response.ok) throw new Error("unreadable");
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
          if (!response.ok) throw new Error("unreadable");
          const data = (await response.json()) as { enabled: boolean; benchmarks: Benchmark[] };
          if (active) {
            setEnabled(data.enabled);
            setHistory(data.benchmarks);
            setSelected(data.benchmarks.at(-1)?.selected_ids ?? []);
            setCollapsed(Boolean(data.benchmarks.at(-1)?.selected_ids?.length));
          }
        })
        .catch(() => {
          if (active) setError("unreadable");
        });
    return () => {
      active = false;
    };
  }, [base, available]);
  if (!available || (!enabled && !error)) return null;
  const latest = history.at(-1);
  async function run() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(base, { method: "POST" });
      if (!response.ok) {
        setError("unavailable");
        return;
      }
      const events = await response.text();
      if (!events.includes("event: research.completed")) {
        setError("failed");
        return;
      }
      await load();
      setCollapsed(false);
      await onChanged();
    } catch {
      setError("unavailable");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!latest) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${base}/${latest.id}/selection`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ selected_ids: selected }),
      });
      if (!response.ok) {
        setError("saveFailed");
        return;
      }
      await load();
      setCollapsed(true);
      await onChanged();
    } catch {
      setError("saveFailed");
    } finally {
      setBusy(false);
    }
  }
  const locked = disabled || busy;
  return (
    <section
      className="flex max-h-[45vh] shrink-0 flex-col gap-3 overflow-y-auto border-b px-4 py-1.5"
      aria-label={t.region}
    >
      <div className="flex min-h-7 flex-wrap items-center gap-2">
        {latest ? (
          <p className="mr-auto text-[13px]">
            {t.summary(latest.version)} · {t.kept(latest.selected_ids?.length ?? 0)}
          </p>
        ) : null}
        {latest ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="order-last"
            aria-expanded={!collapsed}
            aria-label={collapsed ? t.show : t.hide}
            title={collapsed ? t.show : t.hide}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronDownIcon /> : <ChevronUpIcon />}
          </Button>
        ) : null}
        {latest && collapsed ? null : (
          <Button
            variant={latest ? "outline" : "ghost"}
            size="sm"
            disabled={locked || !enabled}
            onClick={() => void run()}
          >
            {busy ? <LoaderCircleIcon className="animate-spin" /> : <SearchIcon />}
            {t.run}
          </Button>
        )}
        {busy ? (
          <p role="status" className="text-xs text-muted-foreground">
            {t.running}
          </p>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-[13px] text-destructive">
          {t[error]}
        </p>
      ) : null}
      {latest && !collapsed ? (
        <>
          {latest.synthesis.products.length === 0 ? (
            <p className="text-muted-foreground">{t.none}</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t.product}</th>
                  <th scope="col">{t.features}</th>
                  <th scope="col">{t.price}</th>
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
                        className="font-semibold text-primary hover:underline"
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
                          className="mr-2 text-xs text-muted-foreground underline"
                        >
                          {t.source}
                        </a>
                      ))}
                    </td>
                    <td>{product.key_features.join(", ")}</td>
                    <td>{product.pricing ?? t.priceUnknown}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              {t.toConfirm}
            </legend>
            {latest.synthesis.features.map((feature) => {
              const id = feature.id;
              if (!id) return null;
              return (
                <label key={id} className="flex items-start gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-primary"
                    disabled={locked}
                    checked={selected.includes(id)}
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? [...selected, id]
                          : selected.filter((value) => value !== id),
                      )
                    }
                  />
                  <span>
                    <span className="font-semibold">{feature.feature}</span>{" "}
                    <Badge variant={RECOMMENDATION_BADGE[feature.recommendation]}>
                      {t.recommendation[feature.recommendation]}
                    </Badge>
                    <span className="block text-muted-foreground">
                      {feature.products.join(", ")} : {feature.justification}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>
          <Button className="mb-1.5 self-start" disabled={locked} onClick={() => void save()}>
            {t.save}
          </Button>
        </>
      ) : null}
    </section>
  );
}
