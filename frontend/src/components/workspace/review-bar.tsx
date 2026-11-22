"use client";

import { RotateCcwIcon } from "lucide-react";
import { useState } from "react";

import { useMessages } from "@/components/preferences/provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ReviewAction, SessionOverview, Stage } from "@/lib/backend/types";
import { cn } from "@/lib/utils";

import { canReopen } from "./view-model";

type NoteAction = Exclude<ReviewAction, "approve">;

/** Human review controls: approve, reject, request changes, reopen a stage. */
export function ReviewBar({
  session,
  selected,
  disabled,
  onReview,
  onReopen,
}: {
  session: SessionOverview;
  selected: Stage;
  disabled: boolean;
  onReview: (stage: Stage, action: ReviewAction, note?: string) => Promise<void>;
  onReopen: (stage: Stage) => Promise<void>;
}) {
  const t = useMessages();
  const [noteAction, setNoteAction] = useState<NoteAction | null>(null);
  const [note, setNote] = useState("");
  const pendingReview = session.pending_human_review ?? null;
  const reopenable = canReopen(session, selected);

  if (!pendingReview && !reopenable) {
    return null;
  }

  return (
    <div
      className={cn(
        "mx-3 mb-3 flex flex-wrap items-center gap-2 rounded-lg border px-4 py-2",
        pendingReview ? "border-primary bg-accent" : "bg-card",
      )}
      role="region"
      aria-label={t.review.region}
    >
      {pendingReview ? (
        <>
          <span className="basis-full font-semibold sm:flex-1 sm:basis-0">
            {t.review.ready(t.stages[pendingReview.from_stage])}
          </span>
          <Button
            disabled={disabled}
            onClick={() => void onReview(pendingReview.from_stage, "approve")}
          >
            {t.review.approve}
          </Button>
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => setNoteAction("request_changes")}
          >
            {t.review.requestChanges}
          </Button>
          <Button variant="destructive" disabled={disabled} onClick={() => setNoteAction("reject")}>
            {t.review.reject}
          </Button>
        </>
      ) : null}
      {reopenable ? (
        <>
          {!pendingReview ? (
            <span className="basis-full text-muted-foreground sm:flex-1 sm:basis-0">
              {t.review.reopenHint}
            </span>
          ) : null}
          <Button variant="outline" disabled={disabled} onClick={() => void onReopen(selected)}>
            <RotateCcwIcon />
            {t.review.reopen(t.stages[selected])}
          </Button>
        </>
      ) : null}

      <Dialog
        open={noteAction !== null}
        onOpenChange={(open) => {
          if (!open) {
            setNoteAction(null);
          }
        }}
      >
        <DialogContent>
          <DialogTitle>
            {noteAction === "reject" ? t.review.rejectTitle : t.review.requestChanges}
          </DialogTitle>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!pendingReview || !noteAction) {
                return;
              }
              const action = noteAction;
              setNoteAction(null);
              void onReview(pendingReview.from_stage, action, note.trim() || undefined).then(() =>
                setNote(""),
              );
            }}
          >
            <Label htmlFor="review-note">{t.review.note}</Label>
            <Textarea
              id="review-note"
              value={note}
              required={noteAction === "request_changes"}
              onChange={(event) => setNote(event.target.value)}
            />
            <DialogFooter>
              <Button type="submit" variant={noteAction === "reject" ? "destructive" : "default"}>
                {noteAction === "reject" ? t.review.reject : t.review.send}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
