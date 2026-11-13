"use client";

import { DownloadIcon } from "lucide-react";
import { useState } from "react";

import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Downloads an export; refusals (delivery plan not ready: 409) are shown, not saved. */
export function ExportMenu({ sessionId }: { sessionId: string }) {
  const [error, setError] = useState<unknown>(null);

  async function download(format: ExportFormat) {
    try {
      const { blob, filename } = await api.downloadExport(sessionId, format);
      saveBlob(blob, filename);
    } catch (caught) {
      setError(caught);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
          <DownloadIcon />
          Export
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {EXPORTS.map((entry) => (
            <DropdownMenuItem key={entry.format} onClick={() => void download(entry.format)}>
              {entry.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={error !== null} onOpenChange={(open) => !open && setError(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export unavailable</DialogTitle>
            <DialogDescription>The backend refused this export.</DialogDescription>
          </DialogHeader>
          <ErrorState error={error} />
        </DialogContent>
      </Dialog>
    </>
  );
}
