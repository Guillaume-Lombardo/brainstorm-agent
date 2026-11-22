"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { MESSAGES, type Messages } from "@/lib/i18n";
import { LOCALE_COOKIE, type Locale } from "@/lib/i18n/locale";
import { writePreferenceCookie } from "@/lib/preference-cookie";
import { THEME_COOKIE, type Theme } from "@/lib/theme";

interface Preferences {
  locale: Locale;
  theme: Theme;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: Theme) => void;
}

const PreferencesContext = createContext<Preferences>({
  locale: "en",
  theme: "system",
  setLocale: () => {},
  setTheme: () => {},
});

/** Display preferences read by the server from cookies, and how to change them. */
export function PreferencesProvider({
  locale,
  theme: initialTheme,
  children,
}: {
  locale: Locale;
  theme: Theme;
  children: ReactNode;
}) {
  const router = useRouter();
  const [theme, setThemeState] = useState(initialTheme);

  function setTheme(next: Theme) {
    setThemeState(next);
    writePreferenceCookie(THEME_COOKIE, next === "system" ? null : next);
  }

  // The server sets this attribute on each load; a refresh that left before the last choice
  // must not undo it.
  useEffect(() => {
    if (theme === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = theme;
    }
  });

  function setLocale(next: Locale) {
    writePreferenceCookie(LOCALE_COOKIE, next);
    // Renders the server components again; client state (a running turn, a draft) is kept.
    router.refresh();
  }

  return (
    <PreferencesContext value={{ locale, theme, setLocale, setTheme }}>
      {children}
    </PreferencesContext>
  );
}

export function usePreferences(): Preferences {
  return useContext(PreferencesContext);
}

/** Interface texts in the current language. */
export function useMessages(): Messages {
  return MESSAGES[usePreferences().locale];
}
