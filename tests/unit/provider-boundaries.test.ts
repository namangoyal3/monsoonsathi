import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMonsoonPlan } from '@/lib/gemini';
import { geocodeLocality } from '@/lib/geocode';
import { fetchLiveWeather } from '@/lib/weather';
import type { Evidence, Profile } from '@/types/contract';

const profile: Profile = {
  locality: 'Bengaluru',
  scope: 'individual',
  phase: 'before',
  language: 'English',
  transportMode: 'walk',
};

const evidence: Evidence[] = [
  {
    id: 'w-current-1',
    kind: 'weather',
    text: 'Live rain conditions.',
    publisher: 'OpenWeather',
  },
];

let originalGeminiKey: string | undefined;
let originalWeatherKey: string | undefined;

beforeEach(() => {
  originalGeminiKey = process.env.GEMINI_API_KEY;
  originalWeatherKey = process.env.OPENWEATHER_API_KEY;
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  process.env.OPENWEATHER_API_KEY = 'test-weather-key';
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalGeminiKey;
  if (originalWeatherKey === undefined) delete process.env.OPENWEATHER_API_KEY;
  else process.env.OPENWEATHER_API_KEY = originalWeatherKey;
});

describe('live provider boundaries', () => {
  it('rejects an unreadable Gemini envelope without returning a fallback plan', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('not-json', { status: 200 }));

    await expect(
      generateMonsoonPlan(
        profile,
        evidence,
        'unavailable',
        'Official alert feed unavailable.',
        new AbortController().signal
      )
    ).rejects.toMatchObject({ code: 'GEMINI_INVALID_RESPONSE' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed when Gemini reports a safety block', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ candidates: [{ finishReason: 'SAFETY' }] })
    );

    await expect(
      generateMonsoonPlan(
        profile,
        evidence,
        'unavailable',
        'Official alert feed unavailable.',
        new AbortController().signal
      )
    ).rejects.toMatchObject({ code: 'GEMINI_BLOCKED' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('cancels retry backoff when the request deadline expires', async () => {
    const controller = new AbortController();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => {
        setTimeout(() => controller.abort(), 5);
        return new Response('', { status: 503 });
      });

    await expect(
      generateMonsoonPlan(
        profile,
        evidence,
        'unavailable',
        'Official alert feed unavailable.',
        controller.signal
      )
    ).rejects.toMatchObject({ code: 'GEMINI_UNAVAILABLE', status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps malformed geocoder JSON to a controlled service error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not-json', { status: 200 })
    );

    await expect(geocodeLocality('Bengaluru')).rejects.toMatchObject({
      code: 'GEOCODE_FAILED',
      status: 502,
    });
  });

  it('maps malformed weather JSON to a controlled service error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not-json', { status: 200 })
    );

    await expect(
      fetchLiveWeather({
        label: 'Boundary test',
        latitude: 10.123456,
        longitude: 70.654321,
      })
    ).rejects.toMatchObject({ code: 'WEATHER_FAILED', status: 502 });
  });
});
