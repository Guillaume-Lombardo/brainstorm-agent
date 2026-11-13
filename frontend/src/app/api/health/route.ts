/** Liveness probe used by the container healthcheck (no backend call). */
export function GET(): Response {
  return Response.json({ status: "ok" });
}
