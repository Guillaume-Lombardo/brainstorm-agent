"use client";

import Link from "next/link";

import { useMessages } from "@/components/preferences/provider";
import { ApiError } from "@/lib/api/errors";
import { MESSAGES, serverText, type Messages } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface ErrorDescription {
  title: string;
  description: string;
  signIn: boolean;
}

/** Turn any failure into a user-facing title and description. */
export function describeError(error: unknown, messages: Messages = MESSAGES.en): ErrorDescription {
  const t = messages.errors;
  if (!(error instanceof ApiError)) {
    return {
      title: t.generic,
      description: error instanceof Error ? serverText(error.message, messages) : t.unexpected,
      signIn: false,
    };
  }
  const title = t[error.code];
  const description = serverText(error.message, messages);
  switch (error.code) {
    case "unauthorized":
      return { title, description: t.unauthorizedHint, signIn: true };
    case "forbidden":
      return { title, description: t.forbiddenHint, signIn: false };
    case "review_pending":
      return { title, description: `${description} ${t.reviewPendingHint}`, signIn: false };
    case "rate_limited":
      return {
        title,
        description:
          error.retryAfterSeconds === undefined
            ? t.rateLimitedHint
            : t.retryIn(error.retryAfterSeconds),
        signIn: false,
      };
    default:
      return { title, description, signIn: false };
  }
}

export function ErrorState({ error, className }: { error: unknown; className?: string }) {
  const messages = useMessages();
  const { title, description, signIn } = describeError(error, messages);
  return (
    <div
      role="alert"
      className={cn("rounded-md bg-destructive-soft px-3 py-2 text-[13px]", className)}
    >
      <p className="font-semibold text-destructive">{title}</p>
      <p>{description}</p>
      {signIn ? (
        <Link className="font-semibold text-primary underline" href="/login">
          {messages.errors.signIn}
        </Link>
      ) : null}
    </div>
  );
}
