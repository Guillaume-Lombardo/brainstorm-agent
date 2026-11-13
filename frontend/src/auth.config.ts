import type { NextAuthConfig } from "next-auth";

/**
 * Provider-free Auth.js settings shared by `proxy.ts` and `auth.ts`.
 * It must not import the backend client.
 */
export const authConfig = {
  // Auth.js errors (SSO refused, provider failure) come back to the login page as `?error=`.
  pages: { signIn: "/login", error: "/login" },
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
      if (auth?.user?.id) {
        return true;
      }
      // Relative callback: the login page only accepts same-origin paths.
      const login = new URL("/login", request.nextUrl);
      login.searchParams.set("callbackUrl", `${pathname}${request.nextUrl.search}`);
      return Response.redirect(login);
    },
    session({ session, token }) {
      if (typeof token.uid === "string") {
        session.user.id = token.uid;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
