"use client";

import { useEffect, useState, type ReactNode } from "react";

import { ErrorState } from "@/components/error-state";
import { useMessages } from "@/components/preferences/provider";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type {
  BacklogExport,
  DeliverySlice,
  IntegrationScenario,
  SessionOverview,
} from "@/lib/backend/types";
import type { Messages } from "@/lib/i18n";

import { contractMatrix, deliverySlices, stageState } from "./view-model";

type Plan =
  | { key: string; plan: BacklogExport }
  | { key: string; pending: true }
  | { key: string; error: unknown };

/**
 * Stage 7 delivery slicing: slices from the session state, waves from the validated
 * plan (`backlog_json` export), which the backend refuses (409) until the plan passes.
 */
export function DeliveryView({
  session,
  revision,
}: {
  session: SessionOverview;
  revision: number;
}) {
  const t = useMessages().delivery;
  const slices = deliverySlices(session);
  const state = stageState(session, "stage_7_delivery_slicing");
  const ready = state !== undefined && !state.stale && slices.length > 0;
  const key = `${session.session_id}:${revision}`;
  const [loaded, setLoaded] = useState<Plan | null>(null);

  useEffect(() => {
    if (!ready) {
      return;
    }
    let active = true;
    api
      .getDeliveryPlan(session.session_id)
      .then((plan) => active && setLoaded({ key, plan }))
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        setLoaded(
          error instanceof ApiError && error.code === "conflict"
            ? { key, pending: true }
            : { key, error },
        );
      });
    return () => {
      active = false;
    };
  }, [session.session_id, key, ready]);

  if (slices.length === 0) {
    return <p className="p-4 text-muted-foreground">{t.empty}</p>;
  }
  // The validated plan carries the dependencies the backend resolved (implicit ones on
  // the first slice and on contract providers); the draft slices only list explicit ones.
  let shown = slices;
  let waves: string[][] | null = null;
  let notice: ReactNode = null;
  if (!ready) {
    notice = t.stale;
  } else if (!loaded || loaded.key !== key) {
    notice = <Skeleton className="h-16 w-full" aria-label={t.loading} />;
  } else if ("error" in loaded) {
    notice = <ErrorState error={loaded.error} />;
  } else if ("pending" in loaded) {
    notice = t.pending;
  } else {
    shown = loaded.plan.slices;
    waves = loaded.plan.waves;
  }
  return <DeliverySlicingView slices={shown} waves={waves} notice={notice} />;
}

export function DeliverySlicingView({
  slices,
  waves,
  notice,
}: {
  slices: DeliverySlice[];
  /** Validated waves of slice ids; `null` while the plan is not validated. */
  waves: string[][] | null;
  notice?: ReactNode;
}) {
  const t = useMessages().delivery;
  return (
    <div className="flex flex-col gap-6 p-4">
      <section aria-labelledby="waves-title" className="flex flex-col gap-2">
        <h3
          id="waves-title"
          className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
        >
          {t.waves}
        </h3>
        {waves ? (
          <DependencyGraph slices={slices} waves={waves} />
        ) : (
          <div className="text-xs text-muted-foreground">{notice}</div>
        )}
      </section>
      <section aria-labelledby="slices-title" className="flex flex-col gap-2">
        <h3
          id="slices-title"
          className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
        >
          {t.slices}
        </h3>
        <div className="grid gap-3">
          {slices.map((slice) => (
            <SliceCard key={slice.id} slice={slice} />
          ))}
        </div>
      </section>
      <section aria-labelledby="contracts-title" className="flex flex-col gap-2">
        <h3
          id="contracts-title"
          className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
        >
          {t.contracts}
        </h3>
        <ContractMatrix slices={slices} />
      </section>
    </div>
  );
}

function scenarioText(scenario: IntegrationScenario, t: Messages["delivery"]): string {
  if (scenario.ears) {
    return scenario.ears;
  }
  return [
    scenario.given && t.given(scenario.given),
    scenario.when && t.when(scenario.when),
    scenario.then && t.then(scenario.then),
  ]
    .filter(Boolean)
    .join(", ");
}

function SliceCard({ slice }: { slice: DeliverySlice }) {
  const t = useMessages().delivery;
  const dependencies = slice.dependencies ?? [];
  const stubs = slice.stubs ?? [];
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border p-3 text-[13px]"
      data-testid={`slice-${slice.id}`}
    >
      <p>
        <span className="font-mono text-xs font-semibold text-primary">{slice.id}</span>
        <span className="block font-semibold">{slice.goal}</span>
      </p>
      <div className="flex flex-wrap gap-1">
        {(slice.owned_domain ?? []).map((domain) => (
          <Badge key={domain} variant="accent">
            {domain}
          </Badge>
        ))}
        {(slice.backlog_item_ids ?? []).map((item) => (
          <Badge key={item}>{item}</Badge>
        ))}
      </div>
      <p>
        <span className="text-muted-foreground">{t.dependsOn}</span>{" "}
        {dependencies.join(", ") || t.none}
      </p>
      <ul className="list-disc pl-4">
        {(slice.integration_scenarios ?? []).map((scenario, index) => (
          <li key={index}>{scenarioText(scenario, t)}</li>
        ))}
      </ul>
      {stubs.length > 0 ? (
        <p>
          <span className="text-muted-foreground">{t.stubs}</span> {stubs.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

const NODE_WIDTH = 120;
const NODE_HEIGHT = 36;
const COLUMN_GAP = 48;
const ROW_GAP = 16;

/** Layered SVG graph: one column per wave, arrows from dependency to dependent. */
function DependencyGraph({ slices, waves }: { slices: DeliverySlice[]; waves: string[][] }) {
  const t = useMessages().delivery;
  const position = new Map<string, { x: number; y: number }>();
  const ordered = waves.map((sliceIds, index) => ({ index, sliceIds }));
  ordered.forEach((wave, column) => {
    wave.sliceIds.forEach((sliceId, row) => {
      position.set(sliceId, {
        x: column * (NODE_WIDTH + COLUMN_GAP),
        y: 20 + row * (NODE_HEIGHT + ROW_GAP),
      });
    });
  });
  const rows = Math.max(1, ...ordered.map((wave) => wave.sliceIds.length));
  const width = Math.max(1, ordered.length) * (NODE_WIDTH + COLUMN_GAP) - COLUMN_GAP;
  const height = 21 + rows * (NODE_HEIGHT + ROW_GAP) - ROW_GAP;
  const names = new Map(slices.map((slice) => [slice.id, slice.goal]));

  return (
    <svg
      role="img"
      aria-label={t.graph}
      viewBox={`0 0 ${width} ${height}`}
      className="w-full max-w-full"
    >
      <defs>
        <marker
          id="arrow"
          viewBox="0 0 8 8"
          refX="8"
          refY="4"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 z" className="fill-muted-foreground" />
        </marker>
      </defs>
      {ordered.map((wave, column) => (
        <text
          key={wave.index}
          x={column * (NODE_WIDTH + COLUMN_GAP) + NODE_WIDTH / 2}
          y={12}
          textAnchor="middle"
          className="fill-muted-foreground text-[10px]"
        >
          {t.wave(wave.index)}
        </text>
      ))}
      {slices.flatMap((slice) =>
        (slice.dependencies ?? []).map((dependency) => {
          const from = position.get(dependency);
          const to = position.get(slice.id);
          if (!from || !to) {
            return null;
          }
          return (
            <line
              key={`${dependency}-${slice.id}`}
              x1={from.x + NODE_WIDTH}
              y1={from.y + NODE_HEIGHT / 2}
              x2={to.x}
              y2={to.y + NODE_HEIGHT / 2}
              className="stroke-muted-foreground"
              strokeWidth={1}
              markerEnd="url(#arrow)"
            />
          );
        }),
      )}
      {[...position.entries()].map(([sliceId, { x, y }]) => (
        <g key={sliceId} data-testid={`graph-node-${sliceId}`}>
          <rect
            x={x}
            y={y}
            width={NODE_WIDTH}
            height={NODE_HEIGHT}
            rx={8}
            className="fill-muted stroke-border"
          />
          <text x={x + 8} y={y + 15} className="fill-foreground text-[10px] font-semibold">
            {sliceId}
          </text>
          <text x={x + 8} y={y + 28} className="fill-muted-foreground text-[9px]">
            {(names.get(sliceId) ?? "").slice(0, 22)}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Contracts × slices: O = owner/provider, C = consumer. */
function ContractMatrix({ slices }: { slices: DeliverySlice[] }) {
  const t = useMessages().delivery;
  const rows = contractMatrix(slices);
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">{t.noContract}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="data-table" aria-label={t.contracts}>
        <thead>
          <tr>
            <th scope="col">{t.contract}</th>
            {slices.map((slice) => (
              <th key={slice.id} scope="col">
                {slice.id}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.owner}-${row.id}`}>
              <th scope="row">
                <span className="font-medium">{row.id}</span> {row.specification}
              </th>
              {slices.map((slice) => {
                const role =
                  row.owner === slice.id ? "O" : row.consumers.includes(slice.id) ? "C" : "";
                return (
                  <td
                    key={slice.id}
                    aria-label={role === "O" ? t.owner : role === "C" ? t.consumer : t.none}
                  >
                    {role}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-xs text-muted-foreground">{t.legend}</p>
    </div>
  );
}
