"use client";

import { useEffect, useState, type ReactNode } from "react";

import { ErrorState } from "@/components/error-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type {
  BacklogExport,
  DeliverySlice,
  IntegrationScenario,
  SessionOverview,
} from "@/lib/backend/types";

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
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Delivery slices appear once the delivery slicing stage starts.
      </p>
    );
  }
  // The validated plan carries the dependencies the backend resolved (implicit ones on
  // the first slice and on contract providers); the draft slices only list explicit ones.
  let shown = slices;
  let waves: string[][] | null = null;
  let notice: ReactNode = null;
  if (!ready) {
    notice = "The delivery plan is stale: revalidate the delivery slicing stage.";
  } else if (!loaded || loaded.key !== key) {
    notice = <Skeleton className="h-16 w-full" aria-label="Loading delivery plan" />;
  } else if ("error" in loaded) {
    notice = <ErrorState error={loaded.error} />;
  } else if ("pending" in loaded) {
    notice = "Waves appear once the delivery plan passes its deterministic checks.";
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
  return (
    <div className="flex flex-col gap-6 p-4">
      <section aria-labelledby="waves-title" className="flex flex-col gap-2">
        <h3 id="waves-title" className="text-sm font-semibold">
          Waves and dependencies
        </h3>
        {waves ? (
          <DependencyGraph slices={slices} waves={waves} />
        ) : (
          <div className="text-xs text-muted-foreground">{notice}</div>
        )}
      </section>
      <section aria-labelledby="slices-title" className="flex flex-col gap-2">
        <h3 id="slices-title" className="text-sm font-semibold">
          Slices
        </h3>
        <div className="grid gap-3">
          {slices.map((slice) => (
            <SliceCard key={slice.id} slice={slice} />
          ))}
        </div>
      </section>
      <section aria-labelledby="contracts-title" className="flex flex-col gap-2">
        <h3 id="contracts-title" className="text-sm font-semibold">
          Contract matrix
        </h3>
        <ContractMatrix slices={slices} />
      </section>
    </div>
  );
}

function scenarioText(scenario: IntegrationScenario): string {
  if (scenario.ears) {
    return scenario.ears;
  }
  return [
    scenario.given && `Given ${scenario.given}`,
    scenario.when && `when ${scenario.when}`,
    scenario.then && `then ${scenario.then}`,
  ]
    .filter(Boolean)
    .join(", ");
}

function SliceCard({ slice }: { slice: DeliverySlice }) {
  const dependencies = slice.dependencies ?? [];
  const stubs = slice.stubs ?? [];
  return (
    <Card size="sm" data-testid={`slice-${slice.id}`}>
      <CardHeader>
        <CardTitle>{slice.id}</CardTitle>
        <CardDescription>{slice.goal}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-xs">
        <div className="flex flex-wrap gap-1">
          {(slice.owned_domain ?? []).map((domain) => (
            <Badge key={domain} variant="secondary">
              {domain}
            </Badge>
          ))}
          {(slice.backlog_item_ids ?? []).map((item) => (
            <Badge key={item} variant="outline">
              {item}
            </Badge>
          ))}
        </div>
        <p>
          <span className="text-muted-foreground">Depends on:</span>{" "}
          {dependencies.join(", ") || "none"}
        </p>
        <ul className="list-disc pl-4">
          {(slice.integration_scenarios ?? []).map((scenario, index) => (
            <li key={index}>{scenarioText(scenario)}</li>
          ))}
        </ul>
        {stubs.length > 0 ? (
          <p>
            <span className="text-muted-foreground">Stubs:</span> {stubs.join(", ")}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

const NODE_WIDTH = 120;
const NODE_HEIGHT = 36;
const COLUMN_GAP = 48;
const ROW_GAP = 16;

/** Layered SVG graph: one column per wave, arrows from dependency to dependent. */
function DependencyGraph({ slices, waves }: { slices: DeliverySlice[]; waves: string[][] }) {
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
  const height = 20 + rows * (NODE_HEIGHT + ROW_GAP);
  const names = new Map(slices.map((slice) => [slice.id, slice.goal]));

  return (
    <svg
      role="img"
      aria-label="Slice dependency graph"
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
          Wave {wave.index}
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
  const rows = contractMatrix(slices);
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">No contract declared yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs" aria-label="Contract matrix">
        <thead>
          <tr>
            <th scope="col" className="border px-2 py-1 text-left">
              Contract
            </th>
            {slices.map((slice) => (
              <th key={slice.id} scope="col" className="border px-2 py-1">
                {slice.id}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.owner}-${row.id}`}>
              <th scope="row" className="border px-2 py-1 text-left font-normal">
                <span className="font-medium">{row.id}</span> {row.specification}
              </th>
              {slices.map((slice) => {
                const role =
                  row.owner === slice.id ? "O" : row.consumers.includes(slice.id) ? "C" : "";
                return (
                  <td
                    key={slice.id}
                    className="border px-2 py-1 text-center"
                    aria-label={role === "O" ? "owner" : role === "C" ? "consumer" : "none"}
                  >
                    {role}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-xs text-muted-foreground">O: owning slice · C: consuming slice</p>
    </div>
  );
}
