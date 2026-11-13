/**
 * Message shown on `/login?error=<type>` after an Auth.js redirect (SSO refused or
 * failed). Unknown values get a generic text: the query string is user-controlled.
 */
export function signInErrorMessage(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  switch (value) {
    case "AccessDenied":
      return "Sign-in refused: the identity provider did not confirm your e-mail address.";
    case "CredentialsSignin":
      return "Invalid email or password.";
    default:
      return "Sign-in failed. Try again later.";
  }
}
