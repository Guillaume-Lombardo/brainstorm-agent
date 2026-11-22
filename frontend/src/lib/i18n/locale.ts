/** Interface languages. The conversation itself follows the language the user writes in. */
export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_COOKIE = "lang";

function isLocale(value: string | undefined): value is Locale {
  return (LOCALES as readonly string[]).includes(value ?? "");
}

/**
 * Interface language of a request: the stored choice, else the preferred supported language
 * of the browser, else English.
 *
 * Args:
 *   cookie (string | undefined): Value of the `lang` cookie.
 *   acceptLanguage (string | null): `Accept-Language` request header.
 *
 * Returns:
 *   Locale: The language to render.
 */
export function resolveLocale(cookie: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(cookie)) {
    return cookie;
  }
  const preferred = (acceptLanguage ?? "")
    .split(",")
    .map((entry) => {
      const [tag, ...parameters] = entry.trim().split(";");
      const quality = parameters.find((parameter) => parameter.trim().startsWith("q="));
      return {
        language: tag.toLowerCase().split("-")[0],
        quality: quality ? Number(quality.trim().slice(2)) : 1,
      };
    })
    .filter((entry) => entry.quality > 0)
    .sort((left, right) => right.quality - left.quality)
    .map((entry) => entry.language)
    .find(isLocale);
  return preferred ?? "en";
}
