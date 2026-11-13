"use client";

import { ArchiveIcon, ArchiveRestoreIcon, PencilIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { ErrorState } from "@/components/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api/client";
import { STAGE_LABELS, STAGES, type SessionOverview } from "@/lib/backend/types";

type TitleDialog = { mode: "create" } | { mode: "rename"; session: SessionOverview };

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

export function SessionsList() {
  const [sessions, setSessions] = useState<SessionOverview[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [dialog, setDialog] = useState<TitleDialog | null>(null);

  const load = useCallback(async () => {
    try {
      setSessions((await api.listSessions(includeArchived)).items);
      setError(null);
    } catch (caught) {
      setError(caught);
    }
  }, [includeArchived]);

  useEffect(() => {
    let active = true;
    api
      .listSessions(includeArchived)
      .then((page) => {
        if (active) {
          setSessions(page.items);
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught);
        }
      });
    return () => {
      active = false;
    };
  }, [includeArchived]);

  async function toggleArchive(session: SessionOverview) {
    try {
      await api.updateSession(session.session_id, { archived: !session.archived });
      await load();
    } catch (caught) {
      setError(caught);
    }
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="sessions-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="sessions-title" className="text-2xl font-semibold">
          Sessions
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setIncludeArchived((value) => !value)}>
            {includeArchived ? "Hide archived" : "Show archived"}
          </Button>
          <Button size="sm" onClick={() => setDialog({ mode: "create" })}>
            <PlusIcon />
            New session
          </Button>
        </div>
      </div>

      {error ? <ErrorState error={error} /> : null}

      {sessions === null && !error ? (
        <div className="flex flex-col gap-2" aria-label="Loading sessions">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}

      {sessions?.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
          <p className="font-medium">No session yet</p>
          <p className="text-sm text-muted-foreground">
            Start a session and pitch your project to begin the framing workflow.
          </p>
          <Button size="sm" onClick={() => setDialog({ mode: "create" })}>
            <PlusIcon />
            Start your first session
          </Button>
        </div>
      ) : null}

      {sessions && sessions.length > 0 ? (
        <ul className="flex flex-col divide-y rounded-xl border">
          {sessions.map((session) => (
            <li key={session.session_id} className="flex items-center gap-3 p-4">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Link
                  href={`/sessions/${session.session_id}`}
                  className="truncate font-medium hover:underline"
                >
                  {session.title}
                </Link>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">
                    Stage {STAGES.indexOf(session.current_stage)} ·{" "}
                    {STAGE_LABELS[session.current_stage]}
                  </Badge>
                  {session.archived ? <Badge variant="outline">Archived</Badge> : null}
                  {session.pending_human_review ? (
                    <Badge variant="outline">Review pending</Badge>
                  ) : null}
                  <span>Updated {formatDate(session.updated_at)}</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Rename ${session.title}`}
                onClick={() => setDialog({ mode: "rename", session })}
              >
                <PencilIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${session.archived ? "Restore" : "Archive"} ${session.title}`}
                onClick={() => void toggleArchive(session)}
              >
                {session.archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <SessionTitleDialog
        dialog={dialog}
        onClose={() => setDialog(null)}
        onSaved={async () => {
          setDialog(null);
          await load();
        }}
      />
    </section>
  );
}

function SessionTitleDialog({
  dialog,
  onClose,
  onSaved,
}: {
  dialog: TitleDialog | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function submit(formData: FormData) {
    if (!dialog) {
      return;
    }
    const title = String(formData.get("title") ?? "");
    setPending(true);
    try {
      if (dialog.mode === "create") {
        const created = await api.createSession(title);
        router.push(`/sessions/${created.session_id}`);
        return;
      }
      await api.updateSession(dialog.session.session_id, { title });
      setError(null);
      await onSaved();
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={dialog !== null}
      onOpenChange={(open) => {
        if (!open) {
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dialog?.mode === "rename" ? "Rename session" : "New session"}</DialogTitle>
        </DialogHeader>
        <form action={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="session-title">Title</Label>
            <Input
              id="session-title"
              name="title"
              required
              maxLength={200}
              defaultValue={dialog?.mode === "rename" ? dialog.session.title : ""}
              autoFocus
            />
          </div>
          {error ? <ErrorState error={error} /> : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {dialog?.mode === "rename" ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
