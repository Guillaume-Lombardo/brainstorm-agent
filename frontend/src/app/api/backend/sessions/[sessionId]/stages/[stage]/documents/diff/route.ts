import { BackendError } from "@/lib/backend";
import { json, requireStage, withCaller } from "@/lib/backend/route";

export const dynamic = "force-dynamic";

function version(value: string | null, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BackendError("validation_error", `"${name}" must be a positive integer.`);
  }
  return parsed;
}

/** Unified diff between two versions (`?from=1&to=2`) computed by the backend. */
export async function GET(
  request: Request,
  context: RouteContext<"/api/backend/sessions/[sessionId]/stages/[stage]/documents/diff">,
): Promise<Response> {
  const { sessionId, stage } = await context.params;
  const query = new URL(request.url).searchParams;
  return withCaller(request, async (caller, backend) =>
    json(
      await backend.documentDiff(caller, sessionId, requireStage(stage), {
        from: version(query.get("from"), "from"),
        to: version(query.get("to"), "to"),
      }),
    ),
  );
}
