"use client";

import { MessageSquarePlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api/client";
import type { DocumentDiff, SectionComment, Stage, StepDocument } from "@/lib/backend/types";

import { DiffView } from "./diff-view";
import { splitSections } from "./markdown-sections";

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
      <div className="flex flex-col gap-2 p-4" aria-label="Loading document">
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
    return (
      <p className="p-4 text-sm text-muted-foreground">
        No document yet for this stage. It appears after the first answer.
      </p>
    );
  }
  const latest = versions.at(-1)!;
  const selectedVersion =
    selection?.key === key
      ? (versions.find((version) => version.version === selection.version) ?? latest)
      : latest;
  const previous = versions.find((version) => version.version === selectedVersion.version - 1);
  const sections = splitSections(selectedVersion.markdown);
  const headings = new Set(sections.map((section) => section.heading));
  const otherComments = comments.filter(
    (comment) => comment.stage === stage && !headings.has(comment.section),
  );

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="document-version" className="text-muted-foreground">
          Version
        </label>
        <select
          id="document-version"
          className="h-8 rounded-lg border bg-background px-2"
          value={selectedVersion.version}
          onChange={(event) => setSelection({ key, version: Number(event.target.value) })}
        >
          {versions.map((version) => (
            <option key={version.version} value={version.version}>
              v{version.version}
              {version.version === latest.version ? " (latest)" : ""}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant={showDiff ? "default" : "outline"}
          disabled={!previous}
          aria-pressed={showDiff}
          onClick={() => setShowDiff((value) => !value)}
        >
          {previous ? `Diff with v${previous.version}` : "No previous version"}
        </Button>
      </div>
      {showDiff && previous ? (
        <BackendDiff
          sessionId={sessionId}
          stage={stage}
          from={previous.version}
          to={selectedVersion.version}
        />
      ) : (
        <article className="flex flex-col gap-2" data-testid="stage-document">
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
            <section aria-label="Review notes" className="flex flex-col gap-2 border-t pt-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase">Review notes</h3>
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
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <section className="group relative">
      <div className="prose-document text-sm">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
      </div>
      {heading ? (
        <div className="flex flex-col gap-2">
          {comments.map((comment, index) => (
            <CommentNote key={comment.id ?? index} comment={comment} />
          ))}
          {readOnly && draft === null ? null : draft === null ? (
            <Button
              variant="ghost"
              size="xs"
              className="self-start text-muted-foreground"
              aria-label={`Comment on ${heading}`}
              onClick={() => setDraft("")}
            >
              <MessageSquarePlusIcon />
              Comment
            </Button>
          ) : (
            <form
              className="flex flex-col gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void onComment(heading, draft).then((saved) => saved && setDraft(null));
              }}
            >
              <Textarea
                aria-label={`Comment on ${heading}`}
                value={draft}
                rows={2}
                required
                onChange={(event) => setDraft(event.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={readOnly}>
                  Add comment
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
  return (
    <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs">
      {comment.body}
      {comment.consumed ? (
        <span className="ml-1 text-muted-foreground">(taken into account)</span>
      ) : (
        <span className="ml-1 text-muted-foreground">(used by the next answer)</span>
      )}
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
    return <Skeleton className="h-24 w-full" aria-label="Loading diff" />;
  }
  if ("error" in loaded) {
    return <ErrorState error={loaded.error} />;
  }
  return <DiffView diff={loaded.diff.diff} />;
}
