"use client";

import { MessageSquarePlusIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { ErrorState } from "@/components/error-state";
import { Markdown } from "@/components/markdown";
import { useMessages } from "@/components/preferences/provider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api/client";
import {
  STAGES,
  type DocumentDiff,
  type SectionComment,
  type Stage,
  type StepDocument,
} from "@/lib/backend/types";
import { MESSAGES } from "@/lib/i18n";

import { DiffView } from "./diff-view";
import { readableDocument, splitSections, translateDocument } from "./markdown-sections";

type Loaded = { key: string; versions: StepDocument[] } | { key: string; error: unknown };

/** Versioned stage document with diff view and section comments. */
export function DocumentPanel({
  sessionId,
  stage,
  revision,
  comments,
  readOnly,
  onComment,
}: {
  sessionId: string;
  stage: Stage;
  revision: number;
  comments: SectionComment[];
  /** Comments are disabled (turn or action in progress, archived session). */
  readOnly: boolean;
  onComment: (section: string, body: string) => Promise<boolean>;
}) {
  const t = useMessages().document;
  const key = `${stage}:${revision}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [selection, setSelection] = useState<{ key: string; version: number } | null>(null);
  const [showDiff, setShowDiff] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .listDocuments(sessionId, stage)
      .then((versions) => active && setLoaded({ key, versions }))
      .catch((error: unknown) => active && setLoaded({ key, error }));
    return () => {
      active = false;
    };
  }, [sessionId, stage, key]);

  if (!loaded || loaded.key !== key) {
    return (
      <div className="flex flex-col gap-2 p-4" aria-label={t.loading}>
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if ("error" in loaded) {
    return <ErrorState error={loaded.error} className="m-4" />;
  }
  const { versions } = loaded;
  if (versions.length === 0) {
    return <p className="p-4 text-muted-foreground">{t.empty}</p>;
  }
  const latest = versions.at(-1)!;
  const selectedVersion =
    selection?.key === key
      ? (versions.find((version) => version.version === selection.version) ?? latest)
      : latest;
  const previous = versions.find((version) => version.version === selectedVersion.version - 1);
  const sections = splitSections(readableDocument(selectedVersion.markdown));
  const headings = new Set(sections.map((section) => section.heading));
  const otherComments = comments.filter(
    (comment) => comment.stage === stage && !headings.has(comment.section),
  );

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={t.version}
          className="h-7 cursor-pointer rounded-md border bg-card px-1.5 text-[13px]"
          value={selectedVersion.version}
          onChange={(event) => setSelection({ key, version: Number(event.target.value) })}
        >
          {versions.map((version) => (
            <option key={version.version} value={version.version}>
              v{version.version}
              {version.version === latest.version ? ` (${t.latest})` : ""}
            </option>
          ))}
        </select>
        {previous ? (
          <Button
            size="sm"
            variant="outline"
            aria-pressed={showDiff}
            onClick={() => setShowDiff((value) => !value)}
          >
            {t.compare(previous.version)}
          </Button>
        ) : null}
      </div>
      {showDiff && previous ? (
        <BackendDiff
          sessionId={sessionId}
          stage={stage}
          from={previous.version}
          to={selectedVersion.version}
        />
      ) : (
        <article data-testid="stage-document">
          {sections.map((section, index) => (
            <DocumentSection
              key={`${section.heading ?? "preamble"}-${index}`}
              heading={section.heading}
              markdown={section.markdown}
              comments={comments.filter(
                (comment) => comment.stage === stage && comment.section === section.heading,
              )}
              readOnly={readOnly}
              onComment={onComment}
            />
          ))}
          {otherComments.length > 0 ? (
            <section aria-label={t.reviewNotes} className="mt-4 flex flex-col gap-2 border-t pt-3">
              <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {t.reviewNotes}
              </h3>
              {otherComments.map((comment, index) => (
                <CommentNote key={comment.id ?? index} comment={comment} />
              ))}
            </section>
          ) : null}
        </article>
      )}
    </div>
  );
}

function DocumentSection({
  heading,
  markdown,
  comments,
  readOnly,
  onComment,
}: {
  heading: string | null;
  markdown: string;
  comments: SectionComment[];
  readOnly: boolean;
  onComment: (section: string, body: string) => Promise<boolean>;
}) {
  const messages = useMessages();
  const t = messages.document;
  const [draft, setDraft] = useState<string | null>(null);
  // The panel is about one stage: its name is not repeated as a heading.
  const named = STAGES.find((stage) => MESSAGES.en.stages[stage] === heading);
  const text = named ? markdown.slice(markdown.indexOf("\n") + 1) : markdown;
  const title = named ? messages.stages[named] : heading && (t.lines[heading] ?? heading);
  const label = t.commentOn(title ?? "");

  return (
    <section className="group first:[&_h1]:mt-0">
      {heading && !readOnly && draft === null ? (
        <Button
          variant="ghost"
          size="icon-xs"
          className="float-right ml-2 focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100"
          aria-label={label}
          title={label}
          onClick={() => setDraft("")}
        >
          <MessageSquarePlusIcon />
        </Button>
      ) : null}
      <Markdown>{translateDocument(text, t)}</Markdown>
      {comments.length > 0 || draft !== null ? (
        <div className="my-2 flex flex-col gap-2">
          {comments.map((comment, index) => (
            <CommentNote key={comment.id ?? index} comment={comment} />
          ))}
          {heading === null || draft === null ? null : (
            <form
              className="flex flex-col gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void onComment(heading, draft).then((saved) => saved && setDraft(null));
              }}
            >
              <Textarea
                aria-label={label}
                value={draft}
                rows={2}
                required
                autoFocus
                onChange={(event) => setDraft(event.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)}>
                  {messages.common.cancel}
                </Button>
                <Button type="submit" size="sm" disabled={readOnly}>
                  {t.addComment}
                </Button>
              </div>
            </form>
          )}
        </div>
      ) : null}
    </section>
  );
}

function CommentNote({ comment }: { comment: SectionComment }) {
  const t = useMessages().document;
  return (
    <p className="rounded-md bg-warn-soft px-3 py-2 text-[13px]">
      {comment.body}{" "}
      <span className="text-muted-foreground">{comment.consumed ? t.consumed : t.pending}</span>
    </p>
  );
}

type LoadedDiff = { key: string; diff: DocumentDiff } | { key: string; error: unknown };

/** Fetches the unified diff of two versions from the backend. */
function BackendDiff({
  sessionId,
  stage,
  from,
  to,
}: {
  sessionId: string;
  stage: Stage;
  from: number;
  to: number;
}) {
  const t = useMessages().document;
  const key = `${stage}:${from}:${to}`;
  const [loaded, setLoaded] = useState<LoadedDiff | null>(null);

  useEffect(() => {
    let active = true;
    api
      .documentDiff(sessionId, stage, from, to)
      .then((diff) => active && setLoaded({ key, diff }))
      .catch((error: unknown) => active && setLoaded({ key, error }));
    return () => {
      active = false;
    };
  }, [sessionId, stage, from, to, key]);

  if (!loaded || loaded.key !== key) {
    return <Skeleton className="h-24 w-full" aria-label={t.loadingDiff} />;
  }
  if ("error" in loaded) {
    return <ErrorState error={loaded.error} />;
  }
  return <DiffView diff={loaded.diff.diff} />;
}
