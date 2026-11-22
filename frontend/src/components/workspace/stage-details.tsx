"use client";

import { CheckIcon, CircleDashedIcon, CircleDotIcon, PencilIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { useMessages } from "@/components/preferences/provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { CoverageStatus, SessionOverview, Stage } from "@/lib/backend/types";
import { serverText } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import {
  draftFromValue,
  isEditable,
  stageFields,
  stageState,
  stageStatus,
  valueFromDraft,
  type FieldView,
  type StageStatus,
} from "./view-model";

const COVERAGE_ICON = {
  clear: [CheckIcon, "text-good"],
  partial: [CircleDotIcon, "text-warn"],
  missing: [CircleDashedIcon, "text-muted-foreground"],
} as const satisfies Record<CoverageStatus, unknown>;

const STATUS_BADGE = {
  locked: "muted",
  active: "accent",
  awaiting_review: "warn",
  validated: "good",
  stale: "warn",
} as const satisfies Record<StageStatus, string>;

/** Readiness checklist and per-field coverage of one stage, with inline edit. */
export function StageDetails({
  session,
  stage,
  readOnly,
  onEditField,
}: {
  session: SessionOverview;
  stage: Stage;
  /** Edits are disabled (turn or action in progress, archived session). */
  readOnly: boolean;
  onEditField: (field: string, value: unknown) => Promise<boolean>;
}) {
  const t = useMessages();
  const status = stageStatus(session, stage);
  const readiness = stageState(session, stage)?.readiness ?? [];
  const passed = readiness.filter((check) => check.passed).length;
  // Field rules show on the fields below: only the other failing rules need their text.
  const failing = readiness.filter((check) => !check.passed && !check.id.startsWith("field:"));
  // The backend edits the active stage only; earlier stages must be reopened first.
  const editable = stage === session.current_stage;

  return (
    <div className="flex flex-col border-t" data-testid="stage-details">
      <div className="flex flex-col gap-2 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">{t.stages[stage]}</h2>
          <Badge variant={STATUS_BADGE[status]}>{t.stageStatus[status]}</Badge>
        </div>
        {status === "stale" ? <p className="text-xs text-warn">{t.stageDetails.stale}</p> : null}
        {readiness.length > 0 ? (
          <p className="text-xs text-muted-foreground tabular-nums">
            {`${t.stageDetails.readiness} ${passed}/${readiness.length}`}
          </p>
        ) : null}
        {failing.length > 0 ? (
          <ul className="flex flex-col gap-1.5 text-xs">
            {failing.map((check) => (
              <li key={check.id} className="flex items-start gap-1.5">
                <XIcon aria-hidden className="mt-px size-3.5 shrink-0 text-destructive" />
                {serverText(check.message, t)}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <ul className="divide-y border-t">
        {stageFields(session, stage, t).map((field) => (
          <FieldRow
            key={field.name}
            field={field}
            editable={editable && isEditable(field.kind)}
            readOnly={readOnly}
            onSave={onEditField}
          />
        ))}
      </ul>
    </div>
  );
}

function FieldRow({
  field,
  editable,
  readOnly,
  onSave,
}: {
  field: FieldView;
  editable: boolean;
  readOnly: boolean;
  onSave: (field: string, value: unknown) => Promise<boolean>;
}) {
  const t = useMessages();
  const [draft, setDraft] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    if (draft === null) {
      return;
    }
    setPending(true);
    const saved = await onSave(field.name, valueFromDraft(field.kind, draft));
    setPending(false);
    if (saved) {
      setDraft(null);
    }
  }

  const [CoverageIcon, coverageColor] = COVERAGE_ICON[field.coverage ?? "missing"];

  return (
    <li className="group flex flex-col gap-1 px-3 py-2 text-[13px]" data-field={field.name}>
      <div className="flex min-h-6 items-center gap-2">
        {field.coverage ? (
          <>
            <CoverageIcon aria-hidden className={cn("size-3.5 shrink-0", coverageColor)} />
            <span className="sr-only">{t.stageDetails.coverage[field.coverage]}</span>
          </>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <span className={cn("flex-1", field.lines.length > 0 && "font-semibold")}>
          {field.label}
        </span>
        {editable && !readOnly && draft === null ? (
          <Button
            variant="ghost"
            size="icon-xs"
            className="focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100"
            aria-label={t.stageDetails.edit(field.label)}
            onClick={() => setDraft(draftFromValue(field.kind, field.value))}
          >
            <PencilIcon />
          </Button>
        ) : null}
      </div>
      {draft === null ? (
        field.lines.length > 0 || field.reason ? (
          <div className="pl-5.5 [overflow-wrap:anywhere] text-muted-foreground">
            {field.lines.length > 1 ? (
              <ul className="list-disc pl-4">
                {field.lines.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            ) : (
              field.lines.map((line) => <p key={line}>{line}</p>)
            )}
            {field.reason ? <p className="text-xs text-warn">{field.reason}</p> : null}
          </div>
        ) : null
      ) : (
        <div className="flex flex-col gap-2">
          {field.kind === "boolean" ? (
            <select
              aria-label={t.stageDetails.value(field.label)}
              className="h-8 rounded-md border bg-card px-2"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            >
              <option value="">–</option>
              <option value="true">{t.common.yes}</option>
              <option value="false">{t.common.no}</option>
            </select>
          ) : (
            <Textarea
              aria-label={t.stageDetails.value(field.label)}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={field.kind === "list" ? 4 : 3}
            />
          )}
          {field.kind === "list" ? (
            <p className="text-xs text-muted-foreground">{t.stageDetails.oneItemPerLine}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
              {t.common.cancel}
            </Button>
            <Button size="sm" disabled={pending || readOnly} onClick={() => void save()}>
              {t.common.save}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
