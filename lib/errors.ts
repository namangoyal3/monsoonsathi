export class AppError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 500) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
  }
}

export function toPublicError(err: unknown): { status: number; body: { ok: false; error: string; code?: string } } {
  if (err instanceof AppError) {
    if (err.status >= 500) {
      return {
        status: err.status,
        body: {
          ok: false,
          error: 'A live service could not complete the request. Please try again.',
          code: 'SERVICE_UNAVAILABLE',
        },
      };
    }
    return {
      status: err.status,
      body: { ok: false, error: err.message, code: err.code },
    };
  }
  return {
    status: 500,
    body: {
      ok: false,
      error: 'An unexpected error occurred. Please try again.',
      code: 'INTERNAL',
    },
  };
}
