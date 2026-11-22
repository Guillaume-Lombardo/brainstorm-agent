import type { Messages } from "@/lib/i18n";

export type SignInError = keyof Messages["login"]["errors"];

/**
 * Error shown on `/login?error=<type>` after an Auth.js redirect (SSO refused or
 * failed). Unknown values get a generic text: the query string is user-controlled.
 */
export function signInError(value: unknown): SignInError | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  switch (value) {
    case "AccessDenied":
      return "refused";
    case "CredentialsSignin":
      return "invalid";
    default:
      return "failed";
  }
}
