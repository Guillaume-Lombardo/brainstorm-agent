import "server-only";

import { cookies, headers } from "next/headers";

import { MESSAGES, type Messages } from "@/lib/i18n";
import { LOCALE_COOKIE, resolveLocale, type Locale } from "@/lib/i18n/locale";
import { resolveTheme, THEME_COOKIE, type Theme } from "@/lib/theme";

/** Interface language of the current request. */
export async function getLocale(): Promise<Locale> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  return resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value, headerStore.get("accept-language"));
}

/** Interface texts of the current request. */
export async function getMessages(): Promise<Messages> {
  return MESSAGES[await getLocale()];
}

/** Colour theme of the current request. */
export async function getTheme(): Promise<Theme> {
  return resolveTheme((await cookies()).get(THEME_COOKIE)?.value);
}
