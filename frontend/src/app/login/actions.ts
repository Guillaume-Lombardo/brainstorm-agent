"use server";

import { AuthError } from "next-auth";

import { signIn } from "@/auth";
import { OIDC_PROVIDER_ID } from "@/lib/auth/oidc";
import { safeCallbackPath } from "@/lib/auth/redirect";

export interface LoginState {
  error: string | null;
}

export async function loginWithPassword(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: safeCallbackPath(formData.get("callbackUrl")),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        error:
          error.type === "CredentialsSignin"
            ? "Invalid email or password."
            : "Sign-in failed. Try again later.",
      };
    }
    // Successful sign-in redirects by throwing; let Next.js handle it.
    throw error;
  }
  return { error: null };
}

export async function loginWithSso(formData: FormData): Promise<void> {
  await signIn(OIDC_PROVIDER_ID, {
    redirectTo: safeCallbackPath(formData.get("callbackUrl")),
  });
}
