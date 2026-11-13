import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { LoginForm } from "@/components/auth/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { readOidcSettings } from "@/lib/auth/oidc";
import { safeCallbackPath } from "@/lib/auth/redirect";

import { loginWithPassword, loginWithSso } from "./actions";

export const metadata: Metadata = { title: "Sign in · Brainstorm Agent" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { callbackUrl } = await searchParams;
  const target = safeCallbackPath(Array.isArray(callbackUrl) ? callbackUrl[0] : callbackUrl);
  const session = await auth();
  if (session?.user?.id) {
    redirect(target);
  }
  const oidc = readOidcSettings(process.env);

  return (
    <main className="flex flex-1 items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Brainstorm Agent</CardTitle>
          <CardDescription>Sign in to frame your project stage by stage.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm
            callbackUrl={target}
            passwordAction={loginWithPassword}
            sso={oidc ? { label: oidc.name, action: loginWithSso } : null}
          />
        </CardContent>
      </Card>
    </main>
  );
}
