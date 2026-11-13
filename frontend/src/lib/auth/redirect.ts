const ORIGIN = "http://callback.invalid";
const FALLBACK = "/sessions";

/**
 * Keep post-login redirects on this application: only same-origin relative
 * paths are accepted, anything else falls back to the sessions page.
 */
export function safeCallbackPath(value: unknown): string {
  // Browsers drop tabs and newlines and read `\` as `/`, so `/\t/evil.example`
  // would leave the site: reject control characters and backslashes outright.
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    /[\u0000-\u001f\u007f\\]/.test(value)
  ) {
    return FALLBACK;
  }
  let url: URL;
  try {
    url = new URL(value, ORIGIN);
  } catch {
    return FALLBACK;
  }
  if (url.origin !== ORIGIN || url.pathname === "/login" || url.pathname.startsWith("/login/")) {
    return FALLBACK;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
