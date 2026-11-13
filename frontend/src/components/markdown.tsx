import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

/**
 * Backend Markdown (documents, assistant replies) rendered as GitHub-flavoured Markdown.
 * Raw HTML is shown as escaped text, never interpreted (no `rehype-raw`); incomplete syntax
 * while streaming renders as plain text until it closes.
 * Memoized so a streaming delta re-parses only the message that changed.
 */
export const Markdown = memo(function Markdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={cn("prose-document", className)}>
      <ReactMarkdown disallowedElements={["img"]} remarkPlugins={[remarkGfm]}>
        {children}
      </ReactMarkdown>
    </div>
  );
});
