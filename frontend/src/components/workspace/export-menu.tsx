"use client";

import { DownloadIcon } from "lucide-react";
import { useState } from "react";

import { ErrorState } from "@/components/error-state";
import { useMessages } from "@/components/preferences/provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api/client";
import type { ExportFormat } from "@/lib/backend/types";

const EXPORTS: ExportFormat[] = ["archive", "markdown", "json", "slice_specs", "backlog_json"];

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
  const t = useMessages().exports;
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
        <DropdownMenuTrigger render={<Button variant="outline" />}>
          <DownloadIcon />
          {/* Icon only on phones, where the header is short of room. */}
          <span className="max-sm:sr-only">{t.button}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {EXPORTS.map((format) => (
            <DropdownMenuItem key={format} onClick={() => void download(format)}>
              {t[format]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={error !== null} onOpenChange={(open) => !open && setError(null)}>
        <DialogContent>
          <DialogTitle>{t.unavailable}</DialogTitle>
          <ErrorState error={error} />
        </DialogContent>
      </Dialog>
    </>
  );
}
