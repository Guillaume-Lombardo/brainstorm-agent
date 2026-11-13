import { BackendError } from "@/lib/backend";
import type { Caller, HttpBackend } from "@/lib/backend/http";
import { withCaller } from "@/lib/backend/route";
import { isExportFormat, type ExportFormat } from "@/lib/backend/types";

export const dynamic = "force-dynamic";

interface ExportFile {
  suffix: string;
  contentType: string;
  body: string;
}

const MARKDOWN = "text/markdown; charset=utf-8";
const JSON_TYPE = "application/json; charset=utf-8";

/** Turn a backend export payload into a downloadable file. */
async function exportFile(
  backend: HttpBackend,
  caller: Caller,
  sessionId: string,
  format: ExportFormat,
): Promise<ExportFile> {
  switch (format) {
    case "markdown": {
      const { markdown } = await backend.exportMarkdown(caller, sessionId);
      return { suffix: "framing.md", contentType: MARKDOWN, body: markdown };
    }
    case "json": {
      const { payload } = await backend.exportJson(caller, sessionId);
      return {
        suffix: "session.json",
        contentType: JSON_TYPE,
        body: `${JSON.stringify(payload, null, 2)}\n`,
      };
    }
    case "backlog_json": {
      const backlog = await backend.exportBacklog(caller, sessionId);
      return {
        suffix: "backlog.json",
        contentType: JSON_TYPE,
        body: `${JSON.stringify(backlog, null, 2)}\n`,
      };
    }
    case "slice_specs": {
      // One Markdown file per slice in the backend; concatenated here, in file order.
      const { specs } = await backend.exportSliceSpecs(caller, sessionId);
      const body = Object.keys(specs)
        .sort()
        .map((name) => `<!-- ${name} -->\n\n${specs[name].trim()}\n`)
        .join("\n---\n\n");
      return { suffix: "slice-specs.md", contentType: MARKDOWN, body };
    }
  }
}

/** Download an export as an attachment. */
export async function GET(
  request: Request,
  context: RouteContext<"/api/backend/sessions/[sessionId]/export/[format]">,
): Promise<Response> {
  const { sessionId, format } = await context.params;
  return withCaller(request, async (caller, backend) => {
    if (!isExportFormat(format)) {
      throw new BackendError("validation_error", `Unknown export format "${format}".`);
    }
    const file = await exportFile(backend, caller, sessionId, format);
    const prefix = sessionId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 8);
    return new Response(file.body, {
      headers: {
        "content-type": file.contentType,
        "content-disposition": `attachment; filename="brainstorm-${prefix}-${file.suffix}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  });
}
