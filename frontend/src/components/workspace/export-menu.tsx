"use client";

import { DownloadIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api/client";
import type { ExportFormat } from "@/lib/backend/types";

const EXPORTS: { format: ExportFormat; label: string }[] = [
  { format: "markdown", label: "Framing document (Markdown)" },
  { format: "json", label: "Session (JSON)" },
  { format: "slice_specs", label: "Slice specs (Markdown)" },
  { format: "backlog_json", label: "Backlog with waves (JSON)" },
];

export function ExportMenu({ sessionId }: { sessionId: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <DownloadIcon />
        Export
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {EXPORTS.map((entry) => (
          <DropdownMenuItem
            key={entry.format}
            render={<a href={api.exportUrl(sessionId, entry.format)} download />}
          >
            {entry.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
