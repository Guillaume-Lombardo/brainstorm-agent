"use client";

import { CheckIcon, MessageSquareWarningIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  STAGE_LABELS,
  type PendingReview,
  type ReviewAction,
  type StageId,
  type StageState,
} from "@/lib/backend/types";

type NoteAction = Exclude<ReviewAction, "approve">;

/** Human review controls: approve, reject, request changes, reopen a stage. */
export function ReviewBar({
  pendingReview,
  selected,
  earlierValidated,
  disabled,
  onReview,
  onReopen,
}: {
  pendingReview: PendingReview | null;
  selected: StageState;
  /** Every stage before `selected` is validated (reopening is ordered). */
  earlierValidated: boolean;
  disabled: boolean;
  onReview: (stage: StageId, action: ReviewAction, note?: string) => Promise<void>;
  onReopen: (stage: StageId) => Promise<void>;
}) {
  const [noteAction, setNoteAction] = useState<NoteAction | null>(null);
  const [note, setNote] = useState("");
  const reopenable =
    (selected.status === "validated" || selected.status === "stale") &&
    earlierValidated &&
    pendingReview?.stage !== selected.stage;

  if (!pendingReview && !reopenable) {
    return null;
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2 text-sm"
      role="region"
      aria-label="Review"
    >
      {pendingReview ? (
        <>
          <span className="flex-1 font-medium">
            {STAGE_LABELS[pendingReview.stage]} is ready for your review.
          </span>
          <Button
            size="sm"
            disabled={disabled}
            onClick={() => void onReview(pendingReview.stage, "approve")}
          >
            <CheckIcon />
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => setNoteAction("request_changes")}
          >
            <MessageSquareWarningIcon />
            Request changes
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={disabled}
            onClick={() => setNoteAction("reject")}
          >
            <XIcon />
            Reject
          </Button>
        </>
      ) : null}
      {reopenable ? (
        <>
          {!pendingReview ? (
            <span className="flex-1 text-muted-foreground">
              {STAGE_LABELS[selected.stage]} is {selected.status}. Reopening marks later stages
              stale.
            </span>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => void onReopen(selected.stage)}
          >
            <RotateCcwIcon />
            Reopen {STAGE_LABELS[selected.stage]}
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
          <DialogHeader>
            <DialogTitle>
              {noteAction === "reject" ? "Reject stage" : "Request changes"}
            </DialogTitle>
            <DialogDescription>
              The note is shown to the agent and kept with the stage document.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!pendingReview || !noteAction) {
                return;
              }
              const action = noteAction;
              setNoteAction(null);
              void onReview(pendingReview.stage, action, note.trim() || undefined).then(() =>
                setNote(""),
              );
            }}
          >
            <Label htmlFor="review-note">Note</Label>
            <Textarea
              id="review-note"
              value={note}
              required={noteAction === "request_changes"}
              onChange={(event) => setNote(event.target.value)}
            />
            <DialogFooter>
              <Button type="submit">{noteAction === "reject" ? "Reject" : "Send"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
