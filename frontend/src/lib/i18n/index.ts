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
  const { server } = messages;
  if (Object.hasOwn(server, text)) {
    return server[text];
  }
  const label = text.slice(0, Math.max(0, text.indexOf(": ")));
  return Object.hasOwn(server, label)
    ? `${server[label]}\u00a0: ${text.slice(label.length + 2)}`
    : text;
}
