import type { OidcRequest } from "@/lib/backend/types";

type Env = Record<string, string | undefined>;

export interface OidcSettings {
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Label of the "Sign in with ..." button. */
  name: string;
}

export const OIDC_PROVIDER_ID = "oidc";

/**
 * Read the optional OIDC provider settings. SSO is enabled only when the
 * issuer, client id and client secret are all set.
 */
export function readOidcSettings(env: Env): OidcSettings | null {
  const issuer = env.AUTH_OIDC_ISSUER?.trim();
  const clientId = env.AUTH_OIDC_CLIENT_ID?.trim();
  const clientSecret = env.AUTH_OIDC_CLIENT_SECRET?.trim();
  if (!issuer || !clientId || !clientSecret) {
    return null;
  }
  return { issuer, clientId, clientSecret, name: env.AUTH_OIDC_NAME?.trim() || "SSO" };
}

/** Claims of an OIDC profile used to resolve the backend user. */
export interface OidcProfileClaims {
  sub?: string | null;
  email?: string | null;
  email_verified?: boolean | null;
  name?: string | null;
}

/**
 * Backend identity of a verified OIDC profile, or `null` when the profile has no
 * subject or no e-mail address the provider verified (`email_verified` must be `true`).
 */
export function oidcIdentity(
  issuer: string,
  profile: OidcProfileClaims | undefined,
): OidcRequest | null {
  const subject = profile?.sub?.trim();
  const email = profile?.email?.trim();
  if (!issuer || !subject || !email || profile?.email_verified !== true) {
    return null;
  }
  return { issuer, subject, email, display_name: profile?.name?.trim() || email };
}
