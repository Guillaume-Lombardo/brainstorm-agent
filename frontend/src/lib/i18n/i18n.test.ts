import { describe, expect, it } from "vitest";

import { STAGE_FIELDS } from "@/lib/backend/generated/stage-fields";

import { MESSAGES, serverText } from ".";
import { resolveLocale } from "./locale";

describe("resolveLocale", () => {
  it("prefers the saved choice, then the browser languages, then English", () => {
    expect(resolveLocale("fr", "en-GB")).toBe("fr");
    expect(resolveLocale("en", "fr-FR")).toBe("en");
    expect(resolveLocale(undefined, "de, fr-CA;q=0.8, en;q=0.5")).toBe("fr");
    expect(resolveLocale(undefined, "en;q=0.5, fr;q=0.9")).toBe("fr");
    expect(resolveLocale("xx", "de")).toBe("en");
    expect(resolveLocale(undefined, null)).toBe("en");
  });
});

describe("French messages", () => {
  it("label every field of the stage contracts", () => {
    const names = Object.values(STAGE_FIELDS).flatMap((fields) => fields.map(({ name }) => name));
    expect(names.filter((name) => !MESSAGES.fr.fields[name])).toEqual([]);
  });
});

describe("serverText", () => {
  it("translates known texts, keeps their details and leaves the rest as received", () => {
    expect(serverText("Unexpected error.", MESSAGES.fr)).toBe("Erreur inattendue.");
    expect(serverText("Unresolved contradictions: A / B", MESSAGES.fr)).toBe(
      "Contradictions non résolues\u00a0: A / B",
    );
    expect(serverText("Something new: A", MESSAGES.fr)).toBe("Something new: A");
    expect(serverText("Unexpected error.", MESSAGES.en)).toBe("Unexpected error.");
  });
});
