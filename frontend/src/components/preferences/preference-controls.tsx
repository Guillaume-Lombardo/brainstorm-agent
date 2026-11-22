"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { type KeyboardEvent } from "react";

import { LOCALES } from "@/lib/i18n/locale";
import { THEMES, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

import { useMessages, usePreferences } from "./provider";

const GROUP = "inline-flex gap-0.5 rounded-md border bg-card p-[3px]";
const OPTION = "inline-flex h-6 items-center rounded-sm px-2 text-muted-foreground";
const SELECTED = "bg-accent text-primary";

const THEME_ICON: Record<Theme, typeof SunIcon> = {
  light: SunIcon,
  dark: MoonIcon,
  system: MonitorIcon,
};

/** Language and theme switches. */
export function PreferenceControls() {
  const { locale, theme, setLocale, setTheme } = usePreferences();
  const t = useMessages().preferences;
  const other = locale === "fr" ? "en" : "fr";

  /** Arrow keys move the selection, as in any radio group. */
  function onThemeKey(event: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (step === undefined) {
      return;
    }
    event.preventDefault();
    const next = (THEMES.indexOf(theme) + step + THEMES.length) % THEMES.length;
    setTheme(THEMES[next]);
    (event.currentTarget.children[next] as HTMLElement).focus();
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        // The label is written in the language the button switches to.
        lang={other}
        title={t.switchLanguage}
        aria-label={t.switchLanguage}
        className={cn(GROUP, "cursor-pointer text-xs font-semibold hover:border-primary")}
        onClick={() => setLocale(other)}
      >
        {LOCALES.map((option) => (
          <span key={option} aria-hidden className={cn(OPTION, option === locale && SELECTED)}>
            {option.toUpperCase()}
          </span>
        ))}
      </button>
      <div role="radiogroup" aria-label={t.theme} className={GROUP} onKeyDown={onThemeKey}>
        {THEMES.map((option) => {
          const Icon = THEME_ICON[option];
          const selected = option === theme;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={t.themes[option]}
              title={t.themes[option]}
              tabIndex={selected ? 0 : -1}
              className={cn(
                OPTION,
                "cursor-pointer",
                selected ? SELECTED : "hover:text-foreground",
              )}
              onClick={() => setTheme(option)}
            >
              <Icon aria-hidden className="size-3.5" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
