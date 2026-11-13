import { readJsonObject, requireStage, requireString, withCaller } from "@/lib/backend/route";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/backend/sessions/[sessionId]/stages/[stage]/fields/[field]">,
): Promise<Response> {
  const { sessionId, stage, field } = await context.params;
  return withCaller(async (caller, backend) => {
    const body = await readJsonObject(request);
    const detail = await backend.updateField(
      caller,
      sessionId,
      requireStage(stage),
      field,
      requireString(body, "value"),
    );
    return Response.json(detail);
  });
}
