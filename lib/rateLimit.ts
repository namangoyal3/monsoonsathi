/** ponytail: per-instance fixed window is an MVP guard; use a shared store when scaling out. */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult =
  | { ok: true; remaining: number; resetAt: number }
  | { ok: false; remaining: 0; resetAt: number; retryAfterSec: number };

/**
 * Allow `limit` requests per `windowMs` for a key (typically client IP).
 * Not globally authoritative across instances — pair with platform limits when available.
 */
export function checkRateLimit(
  key: string,
  limit = 8,
  windowMs = 60_000
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    // Opportunistic cleanup
    if (buckets.size > 2000) {
      for (const [k, b] of buckets) {
        if (b.resetAt <= now) buckets.delete(k);
      }
      while (buckets.size > 2000) {
        const oldest = buckets.keys().next().value;
        if (oldest === undefined) break;
        buckets.delete(oldest);
      }
    }
    return { ok: true, remaining: limit - 1, resetAt };
  }

  if (existing.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  const next: Bucket = { count: existing.count + 1, resetAt: existing.resetAt };
  buckets.set(key, next);
  return {
    ok: true,
    remaining: Math.max(0, limit - next.count),
    resetAt: next.resetAt,
  };
}

export function clientIpFromRequest(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const real = request.headers.get('x-real-ip')?.trim();
  if (real) return real.slice(0, 64);
  return 'unknown';
}
