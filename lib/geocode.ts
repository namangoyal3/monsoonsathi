import { getOpenWeatherApiKey } from '@/lib/env';
import { AppError } from '@/lib/errors';

export interface GeocodedLocation {
  label: string;
  latitude: number;
  longitude: number;
  countryCode?: string;
}

/** Resolve user text with OpenWeather's live geocoder; coordinates are never inferred. */
export async function geocodeLocality(locality: string): Promise<GeocodedLocation> {
  const q = locality.trim();
  if (!q) throw new AppError('INVALID_LOCATION', 'Location is required.', 400);

  const url = new URL('https://api.openweathermap.org/geo/1.0/direct');
  url.searchParams.set('q', q);
  url.searchParams.set('limit', '1');
  url.searchParams.set('appid', getOpenWeatherApiKey());

  let res: Response;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(12_000),
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
  } catch {
    throw new AppError(
      'GEOCODE_UNAVAILABLE',
      'Could not reach the location service. Try again in a moment.',
      503
    );
  }

  if (!res.ok) {
    throw new AppError(
      'GEOCODE_FAILED',
      'Location lookup failed. Check the locality or pincode and retry.',
      502
    );
  }

  const data = (await res.json()) as Array<{
    name: string;
    state?: string;
    country?: string;
    lat: number;
    lon: number;
  }>;
  const hit = data[0];
  if (!hit || !Number.isFinite(hit.lat) || !Number.isFinite(hit.lon)) {
    throw new AppError(
      'LOCATION_NOT_FOUND',
      `Could not resolve “${q}”. Try a city name or pincode (e.g. Bengaluru).`,
      400
    );
  }

  return {
    label: [hit.name, hit.state, hit.country].filter(Boolean).join(', '),
    latitude: hit.lat,
    longitude: hit.lon,
    countryCode: hit.country,
  };
}
