import { json, requireStage, withCaller } from "@/lib/backend/route";

export const dynamic = "force-dynamic";

/** Immutable document versions of one stage, oldest first. */
export async function GET(
  request: Request,
  context: RouteContext<"/api/backend/sessions/[sessionId]/stages/[stage]/documents">,
): Promise<Response> {
  const { sessionId, stage } = await context.params;
  return withCaller(request, async (caller, backend) => {
    const documents = await backend.listStageDocuments(caller, sessionId, requireStage(stage));
    return json(documents.toSorted((left, right) => left.version - right.version));
  });
}
