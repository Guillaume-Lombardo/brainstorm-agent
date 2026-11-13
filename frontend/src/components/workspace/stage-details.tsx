"use client";

import { CheckIcon, PencilIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  STAGE_LABELS,
  type CoverageStatus,
  type SessionOverview,
  type Stage,
} from "@/lib/backend/types";

import { stageStatusLabel } from "./stage-stepper";
import {
  draftFromValue,
  isEditable,
  stageFields,
  stageState,
  stageStatus,
  valueFromDraft,
  type FieldView,
} from "./view-model";

const COVERAGE_CLASS: Record<CoverageStatus, string> = {
  clear: "border-emerald-500 text-emerald-700",
  partial: "border-amber-500 text-amber-700",
  missing: "border-destructive text-destructive",
};

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
  const status = stageStatus(session, stage);
  const state = stageState(session, stage);
  const readiness = state?.readiness ?? [];
  const passed = readiness.filter((check) => check.passed).length;
  // The backend edits the active stage only; earlier stages must be reopened first.
  const editable = stage === session.current_stage;

  return (
    <div className="flex flex-col gap-4" data-testid="stage-details">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{STAGE_LABELS[stage]}</h2>
        <Badge variant={status === "stale" ? "outline" : "secondary"}>
          {stageStatusLabel(status)}
        </Badge>
      </div>
      {status === "stale" ? (
        <p className="text-xs text-amber-700">
          An earlier stage was reopened. Revalidate this stage before relying on it.
        </p>
      ) : null}
      {state?.summary ? <p className="text-xs text-muted-foreground">{state.summary}</p> : null}

      <section aria-labelledby="readiness-title" className="flex flex-col gap-2">
        <h3 id="readiness-title" className="text-xs font-medium text-muted-foreground uppercase">
          Readiness{readiness.length > 0 ? ` ${passed}/${readiness.length}` : ""}
        </h3>
        {readiness.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Checked after the first answer.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {readiness.map((check) => (
              <li key={check.id} className="flex items-start gap-2">
                {check.passed ? (
                  <CheckIcon aria-label="passed" className="mt-0.5 size-4 text-emerald-600" />
                ) : (
                  <XIcon aria-label="failing" className="mt-0.5 size-4 text-destructive" />
                )}
                <span>{check.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="coverage-title" className="flex flex-col gap-2">
        <h3 id="coverage-title" className="text-xs font-medium text-muted-foreground uppercase">
          Coverage
        </h3>
        <ul className="flex flex-col gap-2">
          {stageFields(session, stage).map((field) => (
            <FieldRow
              key={field.name}
              field={field}
              editable={editable && isEditable(field.kind)}
              readOnly={readOnly}
              onSave={onEditField}
            />
          ))}
        </ul>
      </section>
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

  return (
    <li className="flex flex-col gap-1 rounded-lg border p-2 text-sm" data-field={field.name}>
      <div className="flex items-center gap-2">
        <span className="flex-1 font-medium">
          {field.label}
          {field.required ? (
            <span className="text-destructive" aria-label="required">
              {" "}
              *
            </span>
          ) : null}
        </span>
        {field.coverage ? (
          <Badge variant="outline" className={COVERAGE_CLASS[field.coverage]}>
            {field.coverage}
          </Badge>
        ) : null}
        {editable && !readOnly && draft === null ? (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Edit ${field.label}`}
            onClick={() => setDraft(draftFromValue(field.kind, field.value))}
          >
            <PencilIcon />
          </Button>
        ) : null}
      </div>
      {draft === null ? (
        <div className="text-muted-foreground">
          {field.lines.length === 0 ? (
            <span className="italic">Not provided yet</span>
          ) : field.lines.length === 1 ? (
            <p>{field.lines[0]}</p>
          ) : (
            <ul className="list-disc pl-4">
              {field.lines.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          )}
          {field.reason ? (
            <span className="block text-xs text-amber-700">{field.reason}</span>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {field.kind === "boolean" ? (
            <select
              aria-label={`${field.label} value`}
              className="h-8 rounded-lg border bg-background px-2"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            >
              <option value="">Not provided</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          ) : (
            <Textarea
              aria-label={`${field.label} value`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={field.kind === "list" ? 4 : 3}
            />
          )}
          {field.kind === "list" ? (
            <p className="text-xs text-muted-foreground">One item per line.</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button size="sm" disabled={pending || readOnly} onClick={() => void save()}>
              Save
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
