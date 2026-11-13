import { SignJWT } from "jose";

export interface BackendJwtSettings {
  secret: string;
  issuer?: string;
  audience?: string;
  ttlSeconds: number;
}

/**
 * Sign the short-lived HS256 token the Next.js server sends to the backend.
 * `sub` is the backend user id; the backend JWT mode verifies it.
 */
export async function signBackendToken(
  userId: string,
  settings: BackendJwtSettings,
  now: Date = new Date(),
): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  let token = new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + settings.ttlSeconds);
  if (settings.issuer) {
    token = token.setIssuer(settings.issuer);
  }
  if (settings.audience) {
    token = token.setAudience(settings.audience);
  }
  return token.sign(new TextEncoder().encode(settings.secret));
}
