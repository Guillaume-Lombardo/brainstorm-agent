import { json, withCaller } from "@/lib/backend/route";

export const dynamic = "force-dynamic";

/** Validated delivery plan with waves (409 `conflict` until the plan passes its checks). */
export async function GET(
  request: Request,
  context: RouteContext<"/api/backend/sessions/[sessionId]/delivery-plan">,
): Promise<Response> {
  const { sessionId } = await context.params;
  return withCaller(request, async (caller, backend) =>
    json(await backend.exportBacklog(caller, sessionId)),
  );
}
