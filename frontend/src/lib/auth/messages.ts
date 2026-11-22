import type { Messages } from "@/lib/i18n";

/**
 * Message shown on `/login?error=<type>` after an Auth.js redirect (SSO refused or
 * failed). Unknown values get a generic text: the query string is user-controlled.
 */
export function signInErrorMessage(value: unknown, messages: Messages): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  const { errors } = messages.login;
  switch (value) {
    case "AccessDenied":
      return errors.refused;
    case "CredentialsSignin":
      return errors.invalid;
    default:
      return errors.failed;
  }
}
