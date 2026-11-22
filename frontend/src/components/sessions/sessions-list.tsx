"use client";

import { ArchiveIcon, ArchiveRestoreIcon, PencilIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { ErrorState } from "@/components/error-state";
import { useMessages, usePreferences } from "@/components/preferences/provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api/client";
import { STAGES, type SessionOverview, type Stage } from "@/lib/backend/types";
import { cn } from "@/lib/utils";

type TitleDialog = { mode: "create" } | { mode: "rename"; session: SessionOverview };

export function SessionsList() {
  const t = useMessages();
  const { locale } = usePreferences();
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

  const dates = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  return (
    <section className="flex flex-col gap-3" aria-labelledby="sessions-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="sessions-title" className="text-sm font-semibold">
          {t.sessions.title}
        </h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            aria-pressed={includeArchived}
            onClick={() => setIncludeArchived((value) => !value)}
          >
            {t.sessions.archives}
          </Button>
          {sessions?.length ? (
            <Button onClick={() => setDialog({ mode: "create" })}>
              <PlusIcon />
              {t.sessions.create}
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <ErrorState error={error} /> : null}

      {sessions === null && !error ? (
        <Skeleton className="h-40 w-full" aria-label={t.sessions.loading} />
      ) : null}

      {sessions?.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-10">
          <p className="text-muted-foreground">{t.sessions.empty}</p>
          <Button onClick={() => setDialog({ mode: "create" })}>
            <PlusIcon />
            {t.sessions.start}
          </Button>
        </div>
      ) : null}

      {sessions && sessions.length > 0 ? (
        <div className="rounded-lg border bg-card">
          <div
            aria-hidden
            className={cn(
              ROW,
              "hidden border-b py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase sm:grid",
            )}
          >
            <span>{t.sessions.columns.title}</span>
            <span>{t.sessions.columns.stage}</span>
            <span>{t.sessions.columns.updated}</span>
          </div>
          <ul className="divide-y">
            {sessions.map((session) => (
              <li key={session.session_id} className={cn(ROW, "relative py-3 hover:bg-muted")}>
                <div className="flex min-w-0 items-center gap-2">
                  {/* The whole row opens the session; its buttons stay above. */}
                  <Link
                    href={`/sessions/${session.session_id}`}
                    className="truncate font-semibold after:absolute after:inset-0"
                  >
                    {session.title}
                  </Link>
                  {session.archived ? <Badge>{t.sessions.archived}</Badge> : null}
                  {session.pending_human_review ? (
                    <Badge variant="warn">{t.sessions.reviewPending}</Badge>
                  ) : null}
                </div>
                <StageProgress stage={session.current_stage} />
                <span className="text-xs text-muted-foreground tabular-nums">
                  {dates.format(new Date(session.updated_at))}
                </span>
                <div className="relative col-start-2 row-span-3 row-start-1 flex self-center sm:col-start-4 sm:row-span-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t.sessions.renameOne(session.title)}
                    title={t.sessions.rename}
                    onClick={() => setDialog({ mode: "rename", session })}
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={
                      session.archived
                        ? t.sessions.restoreOne(session.title)
                        : t.sessions.archiveOne(session.title)
                    }
                    onClick={() => void toggleArchive(session)}
                  >
                    {session.archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
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

/** Grid of a session row: title, stage, date, actions; stacked on phones. */
const ROW =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 sm:grid-cols-[minmax(0,1fr)_200px_150px_64px]";

/** Current stage, with one segment per stage of the workflow. */
function StageProgress({ stage }: { stage: Stage }) {
  const t = useMessages();
  const current = STAGES.indexOf(stage);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="truncate text-[13px]">{t.stages[stage]}</span>
      <span aria-hidden className="flex gap-0.5">
        {STAGES.map((id, index) => (
          <span
            key={id}
            className={cn(
              "h-1.5 flex-1 rounded-sm bg-muted",
              index < current && "bg-good",
              index === current && "bg-primary",
            )}
          />
        ))}
      </span>
    </div>
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
  const t = useMessages();
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
        <DialogTitle>
          {dialog?.mode === "rename" ? t.sessions.rename : t.sessions.create}
        </DialogTitle>
        <form action={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="session-title">{t.sessions.titleField}</Label>
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
              {dialog?.mode === "rename" ? t.common.save : t.sessions.createSubmit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
