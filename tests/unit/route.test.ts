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

function streamedRequest(body: string): Request {
  const bytes = new TextEncoder().encode(body);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });

  return new Request('http://localhost/api/plan', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `unit-stream-${Date.now()}-${Math.random()}`,
    },
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

describe('POST /api/plan', () => {
  it('rejects oversized streamed bodies before provider calls', async () => {
    const response = await POST(streamedRequest('x'.repeat(32_001)));
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: 'PAYLOAD_TOO_LARGE',
    });
  });

  it('rejects invalid JSON before provider calls', async () => {
    const response = await POST(request('{invalid'));
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await response.json()).toMatchObject({
      ok: false,
      code: 'INVALID_JSON',
    });
  });

  it('rejects unknown profile fields before provider calls', async () => {
    const response = await POST(
      request(
        JSON.stringify({
          profile: {
            locality: 'Bengaluru',
            scope: 'individual',
            phase: 'before',
            language: 'English',
            transportMode: 'walk',
            injected: true,
          },
        })
      )
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    });
  });

  it('rejects a declared oversized body without reading it', async () => {
    const oversized = new Request('http://localhost/api/plan', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': '32001',
        'x-forwarded-for': `unit-declared-${Date.now()}-${Math.random()}`,
      },
      body: '{}',
    });
    const response = await POST(oversized);

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: 'PAYLOAD_TOO_LARGE',
    });
  });
});
