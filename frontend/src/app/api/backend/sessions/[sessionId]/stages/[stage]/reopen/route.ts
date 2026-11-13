import { json, requireStage, withCaller } from "@/lib/backend/route";

export const dynamic = "force-dynamic";

/** Reopen an earlier stage; later stages become stale. */
export async function POST(
  request: Request,
  context: RouteContext<"/api/backend/sessions/[sessionId]/stages/[stage]/reopen">,
): Promise<Response> {
  const { sessionId, stage } = await context.params;
  return withCaller(request, async (caller, backend) =>
    json(await backend.reopenStage(caller, sessionId, requireStage(stage))),
  );
}
