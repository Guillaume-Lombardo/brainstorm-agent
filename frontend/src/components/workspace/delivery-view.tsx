"use client";

import { useEffect, useState } from "react";

import { ErrorState } from "@/components/error-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api/client";
import type { DeliverySlicing, Slice, Wave } from "@/lib/backend/types";

type Loaded = { key: string; slicing: DeliverySlicing } | { key: string; error: unknown };

/** Loads and shows the stage 7 delivery slicing of a session. */
export function DeliveryView({ sessionId, revision }: { sessionId: string; revision: number }) {
  const key = `${sessionId}:${revision}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let active = true;
    api
      .getDeliverySlicing(sessionId)
      .then((slicing) => active && setLoaded({ key, slicing }))
      .catch((error: unknown) => active && setLoaded({ key, error }));
    return () => {
      active = false;
    };
  }, [sessionId, key]);

  if (!loaded || loaded.key !== key) {
    return (
      <div className="p-4" aria-label="Loading delivery slicing">
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if ("error" in loaded) {
    return <ErrorState error={loaded.error} className="m-4" />;
  }
  return <DeliverySlicingView slicing={loaded.slicing} />;
}

export function DeliverySlicingView({ slicing }: { slicing: DeliverySlicing }) {
  if (slicing.slices.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Delivery slices appear once the delivery slicing stage starts.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-6 p-4">
      <section aria-labelledby="waves-title" className="flex flex-col gap-2">
        <h3 id="waves-title" className="text-sm font-semibold">
          Waves and dependencies
        </h3>
        <DependencyGraph slices={slicing.slices} waves={slicing.waves} />
      </section>
      <section aria-labelledby="slices-title" className="flex flex-col gap-2">
        <h3 id="slices-title" className="text-sm font-semibold">
          Slices
        </h3>
        <div className="grid gap-3">
          {slicing.slices.map((slice) => (
            <SliceCard key={slice.id} slice={slice} />
          ))}
        </div>
      </section>
      <section aria-labelledby="contracts-title" className="flex flex-col gap-2">
        <h3 id="contracts-title" className="text-sm font-semibold">
          Contract matrix
        </h3>
        <ContractMatrix slicing={slicing} />
      </section>
    </div>
  );
}

function SliceCard({ slice }: { slice: Slice }) {
  return (
    <Card size="sm" data-testid={`slice-${slice.id}`}>
      <CardHeader>
        <CardTitle>
          {slice.id} · {slice.name}
        </CardTitle>
        <CardDescription>{slice.goal}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-xs">
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary">{slice.ownedDomain}</Badge>
          {slice.backlogItemIds.map((item) => (
            <Badge key={item} variant="outline">
              {item}
            </Badge>
          ))}
        </div>
        <p>
          <span className="text-muted-foreground">Depends on:</span>{" "}
          {slice.dependsOn.join(", ") || "none"}
        </p>
        <ul className="list-disc pl-4">
          {slice.integrationScenarios.map((scenario) => (
            <li key={scenario}>{scenario}</li>
          ))}
        </ul>
        {slice.stubs.length > 0 ? (
          <p>
            <span className="text-muted-foreground">Stubs:</span> {slice.stubs.join(", ")}
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
function DependencyGraph({ slices, waves }: { slices: Slice[]; waves: Wave[] }) {
  const position = new Map<string, { x: number; y: number }>();
  const ordered = [...waves].sort((left, right) => left.index - right.index);
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
  const names = new Map(slices.map((slice) => [slice.id, slice.name]));

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
        slice.dependsOn.map((dependency) => {
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
function ContractMatrix({ slicing }: { slicing: DeliverySlicing }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs" aria-label="Contract matrix">
        <thead>
          <tr>
            <th scope="col" className="border px-2 py-1 text-left">
              Contract
            </th>
            {slicing.slices.map((slice) => (
              <th key={slice.id} scope="col" className="border px-2 py-1">
                {slice.id}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slicing.contracts.map((contract) => (
            <tr key={contract.id}>
              <th scope="row" className="border px-2 py-1 text-left font-normal">
                <span className="font-medium">{contract.id}</span> {contract.name}{" "}
                <Badge variant="outline">{contract.kind}</Badge>
              </th>
              {slicing.slices.map((slice) => {
                const role =
                  contract.ownerSliceId === slice.id
                    ? "O"
                    : slice.consumes.includes(contract.id)
                      ? "C"
                      : "";
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
