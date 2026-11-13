import { AlertCircleIcon } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ApiError } from "@/lib/api/errors";

export interface ErrorDescription {
  title: string;
  description: string;
  signIn: boolean;
}

/** Turn any failure into a user-facing title and description. */
export function describeError(error: unknown): ErrorDescription {
  if (!(error instanceof ApiError)) {
    return {
      title: "Something went wrong",
      description: error instanceof Error ? error.message : "Unexpected error.",
      signIn: false,
    };
  }
  switch (error.code) {
    case "unauthorized":
      return { title: "Session expired", description: "Sign in again to continue.", signIn: true };
    case "forbidden":
      return {
        title: "Access denied",
        description: "You do not have access to this session.",
        signIn: false,
      };
    case "not_found":
      return { title: "Not found", description: error.message, signIn: false };
    case "review_pending":
      return {
        title: "Review pending",
        description: `${error.message} Approve the stage or request changes before sending a new message.`,
        signIn: false,
      };
    case "rate_limited":
      return {
        title: "Too many requests",
        description:
          error.retryAfterSeconds === undefined
            ? "Slow down and try again in a moment."
            : `Try again in ${error.retryAfterSeconds} seconds.`,
        signIn: false,
      };
    case "llm_error":
      return { title: "The assistant failed", description: error.message, signIn: false };
    case "validation_error":
      return { title: "Invalid request", description: error.message, signIn: false };
    case "backend_unavailable":
      return { title: "Service unavailable", description: error.message, signIn: false };
  }
}

export function ErrorState({ error, className }: { error: unknown; className?: string }) {
  const { title, description, signIn } = describeError(error);
  return (
    <Alert variant="destructive" className={className} role="alert">
      <AlertCircleIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{description}</p>
        {signIn ? (
          <Link className="font-medium underline" href="/login">
            Sign in
          </Link>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
