import { requireStage, sseResponse, withCaller } from "@/lib/backend/route";

export const dynamic = "force-dynamic";

/** Let the assistant start a stage; same typed Server-Sent Events as a turn. */
export async function POST(
  request: Request,
  context: RouteContext<"/api/backend/sessions/[sessionId]/stages/[stage]/opening">,
): Promise<Response> {
  const { sessionId, stage } = await context.params;
  return withCaller(request, async (caller, backend) =>
    sseResponse(
      await backend.streamOpening(caller, sessionId, requireStage(stage), request.signal),
    ),
  );
}
