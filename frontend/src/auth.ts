import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "@/auth.config";
import { getBackend } from "@/lib/backend";
import { OIDC_PROVIDER_ID, readOidcSettings } from "@/lib/auth/oidc";

type Providers = NextAuthConfig["providers"];

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
        const user = await getBackend().verifyCredentials(email, password);
        return user ? { id: user.id, email: user.email, name: user.displayName } : null;
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
    async jwt({ token, user, account, profile }) {
      if (account?.provider === OIDC_PROVIDER_ID && profile?.sub) {
        // OIDC identities are linked or provisioned by issuer + subject.
        const backendUser = await getBackend().resolveOidcUser({
          issuer: readOidcSettings(process.env)?.issuer ?? "",
          subject: profile.sub,
          email: typeof profile.email === "string" ? profile.email : null,
          name: typeof profile.name === "string" ? profile.name : null,
        });
        token.uid = backendUser.id;
        token.name = backendUser.displayName;
        token.email = backendUser.email;
      } else if (user?.id) {
        token.uid = user.id;
      }
      return token;
    },
  },
});
