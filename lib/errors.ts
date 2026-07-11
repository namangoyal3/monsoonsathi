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
    return {
      status: err.status,
      body: { ok: false, error: err.message, code: err.code },
    };
  }
  const message = err instanceof Error ? err.message : 'Unexpected server error.';
  // Never leak stack traces or secrets
  const safe =
    message.includes('API_KEY') || message.includes('api key')
      ? 'A required live service is not configured.'
      : message.slice(0, 240);
  return {
    status: 500,
    body: { ok: false, error: safe, code: 'INTERNAL' },
  };
}
