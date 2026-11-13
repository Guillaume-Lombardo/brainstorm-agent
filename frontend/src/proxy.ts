import NextAuth from "next-auth";

import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

/** Redirect signed-out page requests to /login (see `authConfig.callbacks.authorized`). */
export default auth;

export const config = {
  // Everything except Auth.js endpoints, the health probe and static assets.
  matcher: ["/((?!api/auth|api/health|_next/static|_next/image|favicon.ico).*)"],
};
