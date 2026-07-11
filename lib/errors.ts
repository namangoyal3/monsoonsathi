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
    // Client-safe codes that help retries without leaking secrets/prompts
    if (
      err.code.startsWith('GEMINI_') ||
      err.code === 'WEATHER_UNAVAILABLE' ||
      err.code === 'WEATHER_FAILED' ||
      err.code === 'GEOCODE_UNAVAILABLE'
    ) {
      return {
        status: err.status,
        body: {
          ok: false,
          error:
            err.code === 'GEMINI_HTTP' && err.status === 503
              ? err.message
              : 'Live plan generation failed validation or upstream service. Please retry — no mock plan is returned.',
          code: err.code,
        },
      };
    }
    if (err.status >= 500) {
      return {
        status: err.status,
        body: {
          ok: false,
          error: 'A live service could not complete the request. Please try again.',
          code: err.code || 'SERVICE_UNAVAILABLE',
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
