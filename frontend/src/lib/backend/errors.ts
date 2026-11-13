import type { ErrorBody, ErrorCode } from "./types";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  review_pending: 409,
  validation_error: 422,
  rate_limited: 429,
  llm_error: 502,
  backend_unavailable: 503,
};

/** Error raised by a backend client; carries the HTTP status relayed to the browser. */
export class BackendError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryAfterSeconds?: number;

  constructor(
    code: ErrorCode,
    message: string,
    options: { retryAfterSeconds?: number; status?: number } = {},
  ) {
    super(message);
    this.name = "BackendError";
    this.code = code;
    this.status = options.status ?? STATUS_BY_CODE[code];
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  toBody(): ErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.retryAfterSeconds === undefined
          ? {}
          : { retryAfterSeconds: this.retryAfterSeconds }),
      },
    };
  }
}

/** Map an HTTP status returned by the backend to a shared error code. */
export function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 409:
      return "review_pending";
    case 400:
    case 422:
      return "validation_error";
    case 429:
      return "rate_limited";
    case 502:
    case 504:
      return "llm_error";
    default:
      return "backend_unavailable";
  }
}
