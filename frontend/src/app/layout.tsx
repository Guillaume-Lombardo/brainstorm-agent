import type { Metadata } from "next";

import { PreferencesProvider } from "@/components/preferences/provider";
import { getLocale, getTheme } from "@/lib/preferences";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Brainstorm Agent", template: "%s · Brainstorm Agent" },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [locale, theme] = await Promise.all([getLocale(), getTheme()]);
  return (
    <html
      lang={locale}
      data-theme={theme === "system" ? undefined : theme}
      className="h-full antialiased"
    >
      <body className="flex min-h-full flex-col">
        <PreferencesProvider locale={locale} theme={theme}>
          {children}
        </PreferencesProvider>
      </body>
    </html>
  );
}
