import type { NextAuthConfig } from "next-auth";

/**
 * Provider-free Auth.js settings shared by `proxy.ts` and `auth.ts`.
 * It must not import the backend client.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (pathname === "/login") {
        return true;
      }
      // Route handlers answer 401 JSON themselves; pages redirect to /login.
      if (pathname.startsWith("/api/")) {
        return true;
      }
      return Boolean(auth?.user?.id);
    },
    session({ session, token }) {
      if (typeof token.uid === "string") {
        session.user.id = token.uid;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
