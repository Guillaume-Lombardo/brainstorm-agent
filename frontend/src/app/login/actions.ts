"use server";

import { AuthError, CredentialsSignin } from "next-auth";

import { signIn } from "@/auth";
import type { SignInError } from "@/lib/auth/messages";
import { OIDC_PROVIDER_ID } from "@/lib/auth/oidc";
import { safeCallbackPath } from "@/lib/auth/redirect";

export interface LoginState {
  error: SignInError | null;
}

/** Error shown for a failed password sign-in; never says which part was wrong. */
function credentialsError(error: AuthError): SignInError {
  if (error instanceof CredentialsSignin) {
    return error.code === "rate_limited" ? "rateLimited" : "invalid";
  }
  return "failed";
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
      return { error: credentialsError(error) };
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
