import type { ErrorBody, ErrorCode } from "@/lib/backend/types";

/** Error returned by the Next.js proxy to browser code. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiErrorFromResponse(response: Response): Promise<ApiError> {
  let body: Partial<ErrorBody> = {};
  try {
    body = (await response.json()) as Partial<ErrorBody>;
  } catch {
    // Keep the defaults below.
  }
  const retryHeader = Number(response.headers.get("retry-after"));
  return new ApiError(
    response.status,
    body.error?.code ?? (response.status === 401 ? "unauthorized" : "backend_unavailable"),
    body.error?.message ?? `Request failed (${response.status}).`,
    body.error?.retryAfterSeconds ??
      (Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : undefined),
  );
}
