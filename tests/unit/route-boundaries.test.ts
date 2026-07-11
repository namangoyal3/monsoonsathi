import { describe, expect, it } from 'vitest';

import { POST } from '@/app/api/plan/route';

function planRequest(body: string, ip: string, contentLength?: number): Request {
  return new Request('http://localhost/api/plan', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
      ...(contentLength === undefined
        ? {}
        : { 'content-length': String(contentLength) }),
    },
    body,
  });
}

describe('POST /api/plan boundaries', () => {
  it('rejects malformed JSON with no-store security headers', async () => {
    const response = await POST(planRequest('{', 'test-invalid-json'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(body).toMatchObject({ ok: false, code: 'INVALID_JSON' });
  });

  it('rejects unknown profile fields before calling live providers', async () => {
    const response = await POST(
      planRequest(
        JSON.stringify({
          profile: {
            locality: 'Bengaluru',
            scope: 'individual',
            phase: 'before',
            language: 'English',
            transportMode: 'walk',
            injected: true,
          },
        }),
        'test-strict-schema'
      )
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ ok: false, code: 'VALIDATION' });
  });

  it('rejects a declared oversized body before reading or parsing it', async () => {
    const response = await POST(
      planRequest('{}', 'test-oversized', 32_001)
    );
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body).toMatchObject({ ok: false, code: 'PAYLOAD_TOO_LARGE' });
  });
});
