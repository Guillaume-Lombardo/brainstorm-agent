import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { LoginForm } from "@/components/auth/login-form";
import { PreferenceControls } from "@/components/preferences/preference-controls";
import { signInError } from "@/lib/auth/messages";
import { readOidcSettings } from "@/lib/auth/oidc";
import { safeCallbackPath } from "@/lib/auth/redirect";
import { getMessages } from "@/lib/preferences";

import { loginWithPassword, loginWithSso } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).login.title };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { callbackUrl, error } = await searchParams;
  const target = safeCallbackPath(Array.isArray(callbackUrl) ? callbackUrl[0] : callbackUrl);
  const session = await auth();
  if (session?.user?.id) {
    redirect(target);
  }
  const oidc = readOidcSettings(process.env);

  return (
    <main className="flex flex-1 flex-col">
      <div className="flex justify-end px-4 py-3">
        <PreferenceControls />
      </div>
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-4 pb-24">
        <h1 className="text-[22px] leading-none font-bold">Brainstorm Agent</h1>
        <div className="rounded-lg border bg-card p-4">
          <LoginForm
            callbackUrl={target}
            initialError={signInError(Array.isArray(error) ? error[0] : error)}
            passwordAction={loginWithPassword}
            sso={oidc ? { label: oidc.name, action: loginWithSso } : null}
          />
        </div>
      </div>
    </main>
  );
}
