"use client";

import { CheckIcon, PencilIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  STAGE_LABELS,
  type Coverage,
  type FieldCoverage,
  type StageState,
} from "@/lib/backend/types";

import { stageStatusLabel } from "./stage-stepper";

const COVERAGE_CLASS: Record<Coverage, string> = {
  clear: "border-emerald-500 text-emerald-700",
  partial: "border-amber-500 text-amber-700",
  missing: "border-destructive text-destructive",
};

/** Readiness checklist and per-field coverage of one stage, with inline edit. */
export function StageDetails({
  stage,
  readOnly,
  onEditField,
}: {
  stage: StageState;
  /** Edits are disabled (turn or action in progress, archived session). */
  readOnly: boolean;
  onEditField: (field: string, value: string) => Promise<boolean>;
}) {
  const passed = stage.readiness.filter((check) => check.passed).length;
  const editable = stage.status === "active" || stage.status === "stale";

  return (
    <div className="flex flex-col gap-4" data-testid="stage-details">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{STAGE_LABELS[stage.stage]}</h2>
        <Badge variant={stage.status === "stale" ? "outline" : "secondary"}>
          {stageStatusLabel(stage.status)}
        </Badge>
      </div>
      {stage.status === "stale" ? (
        <p className="text-xs text-amber-700">
          An earlier stage was reopened. Revalidate this stage before relying on it.
        </p>
      ) : null}

      <section aria-labelledby="readiness-title" className="flex flex-col gap-2">
        <h3 id="readiness-title" className="text-xs font-medium text-muted-foreground uppercase">
          Readiness {passed}/{stage.readiness.length}
        </h3>
        <ul className="flex flex-col gap-1 text-sm">
          {stage.readiness.map((check) => (
            <li key={check.id} className="flex items-start gap-2">
              {check.passed ? (
                <CheckIcon aria-label="passed" className="mt-0.5 size-4 text-emerald-600" />
              ) : (
                <XIcon aria-label="failing" className="mt-0.5 size-4 text-destructive" />
              )}
              <span>{check.label}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="coverage-title" className="flex flex-col gap-2">
        <h3 id="coverage-title" className="text-xs font-medium text-muted-foreground uppercase">
          Coverage
        </h3>
        <ul className="flex flex-col gap-2">
          {stage.fields.map((field) => (
            <FieldRow
              key={field.field}
              field={field}
              editable={editable}
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
  field: FieldCoverage;
  editable: boolean;
  readOnly: boolean;
  onSave: (field: string, value: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    if (draft === null) {
      return;
    }
    setPending(true);
    const saved = await onSave(field.field, draft);
    setPending(false);
    if (saved) {
      setDraft(null);
    }
  }

  return (
    <li className="flex flex-col gap-1 rounded-lg border p-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="flex-1 font-medium">
          {field.label}
          {field.critical ? (
            <span className="text-destructive" aria-label="critical">
              {" "}
              *
            </span>
          ) : null}
        </span>
        <Badge variant="outline" className={COVERAGE_CLASS[field.coverage]}>
          {field.coverage}
        </Badge>
        {editable && !readOnly && draft === null ? (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Edit ${field.label}`}
            onClick={() => setDraft(field.value ?? "")}
          >
            <PencilIcon />
          </Button>
        ) : null}
      </div>
      {draft === null ? (
        <p className="text-muted-foreground">
          {field.value ?? <span className="italic">Not provided yet</span>}
          {field.reason ? (
            <span className="block text-xs text-amber-700">{field.reason}</span>
          ) : null}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <Textarea
            aria-label={`${field.label} value`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
          />
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
