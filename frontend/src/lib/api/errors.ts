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

function fallbackCode(status: number): ErrorCode {
  switch (status) {
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 429:
      return "rate_limited";
    default:
      return "backend_unavailable";
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
    body.error?.code ?? fallbackCode(response.status),
    body.error?.message ?? `Request failed (${response.status}).`,
    body.error?.retryAfterSeconds ??
      (Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : undefined),
  );
}
