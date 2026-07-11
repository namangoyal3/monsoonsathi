import { AppError } from '@/lib/errors';

export interface GeocodedLocation {
  label: string;
  latitude: number;
  longitude: number;
  countryCode?: string;
}

/**
 * Resolve a free-text locality using Open-Meteo Geocoding (no API key).
 * Real live geocoding — never fabricates coordinates.
 */
export async function geocodeLocality(locality: string): Promise<GeocodedLocation> {
  const q = locality.trim();
  if (!q) {
    throw new AppError('INVALID_LOCATION', 'Location is required.', 400);
  }

  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', q);
  url.searchParams.set('count', '1');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(12_000),
      headers: { Accept: 'application/json', 'User-Agent': 'MonsoonSathi/1.0' },
      cache: 'no-store',
    });
  } catch (err) {
    // one quick retry for transient network blips
    try {
      await new Promise((r) => setTimeout(r, 400));
      res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(12_000),
        headers: { Accept: 'application/json', 'User-Agent': 'MonsoonSathi/1.0' },
        cache: 'no-store',
      });
    } catch {
      const detail = err instanceof Error ? err.message : 'network error';
      console.error(JSON.stringify({ code: 'GEOCODE_UNAVAILABLE', detail: detail.slice(0, 120) }));
      throw new AppError(
        'GEOCODE_UNAVAILABLE',
        'Could not reach the location service. Try again in a moment.',
        503
      );
    }
  }

  if (!res.ok) {
    throw new AppError(
      'GEOCODE_FAILED',
      'Location lookup failed. Check the locality or pincode and retry.',
      502
    );
  }

  const data = (await res.json()) as {
    results?: Array<{
      name: string;
      admin1?: string;
      country?: string;
      country_code?: string;
      latitude: number;
      longitude: number;
    }>;
  };

  const hit = data.results?.[0];
  if (!hit) {
    throw new AppError(
      'LOCATION_NOT_FOUND',
      `Could not resolve “${q}”. Try a city name or pincode (e.g. Bengaluru).`,
      400
    );
  }

  const parts = [hit.name, hit.admin1, hit.country].filter(Boolean);
  return {
    label: parts.join(', '),
    latitude: hit.latitude,
    longitude: hit.longitude,
    countryCode: hit.country_code,
  };
}
