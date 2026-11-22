"use client";

import { useActionState } from "react";

import { useMessages } from "@/components/preferences/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface LoginFormProps {
  callbackUrl: string;
  /** Error carried by an Auth.js redirect (`/login?error=`). */
  initialError?: string | null;
  passwordAction: (
    previous: { error: string | null },
    formData: FormData,
  ) => Promise<{ error: string | null }>;
  /** Present only when an OIDC provider is configured. */
  sso: { label: string; action: (formData: FormData) => Promise<void> } | null;
}

export function LoginForm({
  callbackUrl,
  initialError = null,
  passwordAction,
  sso,
}: LoginFormProps) {
  const t = useMessages().login;
  const [state, formAction, pending] = useActionState(passwordAction, { error: initialError });

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">{t.email}</Label>
          <Input id="email" name="email" type="email" autoComplete="username" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">{t.password}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        {state.error ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? t.submitting : t.submit}
        </Button>
      </form>
      {sso ? (
        <>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {t.or}
            <span className="h-px flex-1 bg-border" />
          </div>
          <form action={sso.action}>
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <Button type="submit" variant="outline" className="w-full">
              {t.sso(sso.label)}
            </Button>
          </form>
        </>
      ) : null}
    </div>
  );
}
