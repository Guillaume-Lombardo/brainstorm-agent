import { ApiError } from "@/lib/api/errors";
import type { ErrorCode } from "@/lib/backend/types";

import type { TurnFailure } from "./state";

const KNOWN_CODES: readonly ErrorCode[] = [
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "review_pending",
  "rate_limited",
  "llm_error",
  "validation_error",
  "backend_unavailable",
];

export function errorToFailure(error: unknown): TurnFailure {
  if (error instanceof ApiError) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
      retryAfterSeconds: error.retryAfterSeconds,
    };
  }
  return {
    code: "backend_unavailable",
    message: error instanceof Error ? error.message : "Unexpected error.",
  };
}

export function failureToError(failure: TurnFailure): ApiError {
  const code = (KNOWN_CODES as readonly string[]).includes(failure.code)
    ? (failure.code as ErrorCode)
    : "backend_unavailable";
  return new ApiError(failure.status ?? 0, code, failure.message, failure.retryAfterSeconds);
}
