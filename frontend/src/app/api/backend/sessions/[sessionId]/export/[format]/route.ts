import { BackendError } from "@/lib/backend";
import { withCaller } from "@/lib/backend/route";
import { EXPORT_FORMATS, type ExportFormat } from "@/lib/backend/types";

export const dynamic = "force-dynamic";

/** Download an export as an attachment. */
export async function GET(
  _request: Request,
  context: RouteContext<"/api/backend/sessions/[sessionId]/export/[format]">,
): Promise<Response> {
  const { sessionId, format } = await context.params;
  return withCaller(async (caller, backend) => {
    if (!(EXPORT_FORMATS as readonly string[]).includes(format)) {
      throw new BackendError("validation_error", `Unknown export format "${format}".`);
    }
    const file = await backend.exportSession(caller, sessionId, format as ExportFormat);
    const filename = file.filename.replace(/[^A-Za-z0-9._-]/g, "_");
    return new Response(file.body, {
      headers: {
        "content-type": file.contentType,
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  });
}
