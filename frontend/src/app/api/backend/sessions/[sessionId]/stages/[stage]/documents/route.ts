import { requireStage, withCaller } from "@/lib/backend/route";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/backend/sessions/[sessionId]/stages/[stage]/documents">,
): Promise<Response> {
  const { sessionId, stage } = await context.params;
  return withCaller(async (caller, backend) =>
    Response.json(await backend.listDocumentVersions(caller, sessionId, requireStage(stage))),
  );
}
