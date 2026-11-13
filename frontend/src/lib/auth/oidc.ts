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
