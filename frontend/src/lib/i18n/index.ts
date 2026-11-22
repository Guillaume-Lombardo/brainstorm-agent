import { en, type Messages } from "./en";
import { fr } from "./fr";
import type { Locale } from "./locale";

export type { Messages };

export const MESSAGES: Record<Locale, Messages> = { en, fr };

/**
 * Translates a text the server wrote in English; unknown texts are shown as received.
 * A text with details after a colon ("Unresolved contradictions: …") keeps them as they are.
 */
export function serverText(text: string, messages: Messages): string {
  const exact = messages.server[text];
  if (exact) {
    return exact;
  }
  const colon = text.indexOf(": ");
  const label = colon > 0 ? messages.server[text.slice(0, colon)] : undefined;
  return label ? `${label} : ${text.slice(colon + 2)}` : text;
}
