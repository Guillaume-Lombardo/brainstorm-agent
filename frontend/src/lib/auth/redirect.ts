/**
 * Keep post-login redirects on this application: only same-origin relative
 * paths are accepted, anything else falls back to the sessions page.
 */
export function safeCallbackPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/sessions";
  }
  if (value.startsWith("/\\") || value.startsWith("/login")) {
    return "/sessions";
  }
  return value;
}
