"use server";

import { AuthError, CredentialsSignin } from "next-auth";

import { signIn } from "@/auth";
import { OIDC_PROVIDER_ID } from "@/lib/auth/oidc";
import { safeCallbackPath } from "@/lib/auth/redirect";
import type { Messages } from "@/lib/i18n";
import { getMessages } from "@/lib/preferences";

export interface LoginState {
  error: string | null;
}

/** User-facing message of a failed password sign-in; never says which part was wrong. */
function credentialsErrorMessage(error: AuthError, { login: { errors } }: Messages): string {
  if (error instanceof CredentialsSignin) {
    return error.code === "rate_limited" ? errors.rateLimited : errors.invalid;
  }
  return errors.failed;
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
      return { error: credentialsErrorMessage(error, await getMessages()) };
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
