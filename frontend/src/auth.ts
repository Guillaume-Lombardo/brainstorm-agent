import NextAuth, { CredentialsSignin, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "@/auth.config";
import { BackendError, getBackend } from "@/lib/backend";
import { OIDC_PROVIDER_ID, oidcIdentity, readOidcSettings } from "@/lib/auth/oidc";

type Providers = NextAuthConfig["providers"];

/** The backend refused the attempt: too many failures for this identity (HTTP 429). */
class LoginRateLimited extends CredentialsSignin {
  code = "rate_limited";
}

/** Credentials provider always; the OIDC provider only when configured. */
function buildProviders(env: Record<string, string | undefined>): Providers {
  const providers: Providers = [
    Credentials({
      credentials: { email: {}, password: {} }, // pragma: allowlist secret
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email : "";
        const password = typeof credentials?.password === "string" ? credentials.password : ""; // pragma: allowlist secret
        if (!email || !password) {
          return null;
        }
        try {
          // Server-to-server login bridge; the backend limits attempts per identity.
          const user = await getBackend().verifyCredentials(email, password);
          return user ? { id: user.id, email: user.email, name: user.display_name } : null;
        } catch (error) {
          if (error instanceof BackendError && error.code === "rate_limited") {
            throw new LoginRateLimited();
          }
          throw error;
        }
      },
    }),
  ];
  const oidc = readOidcSettings(env);
  if (oidc) {
    providers.push({
      id: OIDC_PROVIDER_ID,
      name: oidc.name,
      type: "oidc",
      issuer: oidc.issuer,
      clientId: oidc.clientId,
      clientSecret: oidc.clientSecret,
    });
  }
  return providers;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: buildProviders(process.env),
  callbacks: {
    ...authConfig.callbacks,
    signIn({ account, profile }) {
      // Only verified e-mail addresses may sign in or be linked through SSO.
      if (account?.provider === OIDC_PROVIDER_ID) {
        return oidcIdentity(readOidcSettings(process.env)?.issuer ?? "", profile) !== null;
      }
      return true;
    },
    async jwt({ token, user, account, profile }) {
      if (account?.provider === OIDC_PROVIDER_ID) {
        const identity = oidcIdentity(readOidcSettings(process.env)?.issuer ?? "", profile);
        if (!identity) {
          throw new Error("OIDC profile without a verified e-mail address.");
        }
        // OIDC identities are linked or provisioned by issuer + subject.
        const backendUser = await getBackend().resolveOidcUser(identity);
        token.uid = backendUser.id;
        token.name = backendUser.display_name;
        token.email = backendUser.email;
      } else if (user?.id) {
        token.uid = user.id;
      }
      return token;
    },
  },
});
