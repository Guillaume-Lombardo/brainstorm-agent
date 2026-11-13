import { withCaller } from "@/lib/backend/route";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/backend/sessions/[sessionId]/delivery-slicing">,
): Promise<Response> {
  const { sessionId } = await context.params;
  return withCaller(async (caller, backend) =>
    Response.json(await backend.getDeliverySlicing(caller, sessionId)),
  );
}
