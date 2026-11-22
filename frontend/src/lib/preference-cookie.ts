const ONE_YEAR = 60 * 60 * 24 * 365;

/** Stores a display preference so the server renders it on the next request; `null` forgets it. */
export function writePreferenceCookie(name: string, value: string | null) {
  document.cookie = `${name}=${value ?? ""}; path=/; max-age=${value === null ? 0 : ONE_YEAR}; samesite=lax`;
}
