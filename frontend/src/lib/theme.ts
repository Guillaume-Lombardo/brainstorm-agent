/** Colour themes; without a stored choice the page follows the system. */
export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_COOKIE = "theme";

/** Theme of a request from its cookie; anything else than an explicit choice is the system. */
export function resolveTheme(cookie: string | undefined): Theme {
  return cookie === "light" || cookie === "dark" ? cookie : "system";
}
