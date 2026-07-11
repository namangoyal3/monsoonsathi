import { describe, expect, it } from 'vitest';
import { POST } from '@/app/api/plan/route';

function request(body: string): Request {
  return new Request('http://localhost/api/plan', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `unit-${Date.now()}-${Math.random()}`,
    },
    body,
  });
}

describe('POST /api/plan', () => {
  it('rejects oversized streamed bodies before provider calls', async () => {
    const response = await POST(request('x'.repeat(32_001)));
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: 'PAYLOAD_TOO_LARGE',
    });
  });

  it('rejects invalid JSON before provider calls', async () => {
    const response = await POST(request('{invalid'));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: 'INVALID_JSON',
    });
  });
});
