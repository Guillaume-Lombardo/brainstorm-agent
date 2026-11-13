import { readJsonObject, requireStage, requireString, withCaller } from "@/lib/backend/route";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: RouteContext<"/api/backend/sessions/[sessionId]/comments">,
): Promise<Response> {
  const { sessionId } = await context.params;
  return withCaller(async (caller, backend) => {
    const body = await readJsonObject(request);
    const detail = await backend.addComment(caller, sessionId, {
      stage: requireStage(requireString(body, "stage")),
      section: requireString(body, "section"),
      body: requireString(body, "body"),
    });
    return Response.json(detail);
  });
}
