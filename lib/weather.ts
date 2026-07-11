import { getOpenWeatherApiKey } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { cacheGet, cacheSet, weatherCacheKey } from '@/lib/cache';
import type { GeocodedLocation } from '@/lib/geocode';
import type { AlertState, Evidence, LiveWeatherSnapshot } from '@/types/contract';

const WEATHER_TTL_MS = 4 * 60_000;

export function describeWeatherCode(code: number): string {
  if (code >= 200 && code < 300) return 'Thunderstorm';
  if (code >= 300 && code < 400) return 'Drizzle';
  if (code >= 500 && code < 600) return code >= 502 ? 'Heavy rain' : 'Rain';
  if (code >= 600 && code < 700) return 'Snow';
  if (code >= 700 && code < 800) return 'Low visibility';
  if (code === 800) return 'Clear sky';
  if (code === 801) return 'Few clouds';
  if (code > 801 && code < 900) return 'Cloudy';
  return 'Conditions unavailable';
}

export interface WeatherBundle {
  weather: LiveWeatherSnapshot;
  sources: Evidence[];
  alertState: AlertState;
  alertSummary: string;
  weatherMs: number;
}

type CurrentResponse = {
  dt?: number;
  main?: { temp?: number; humidity?: number };
  weather?: Array<{ id?: number; description?: string }>;
  wind?: { speed?: number };
  rain?: { '1h'?: number; '3h'?: number };
  snow?: { '1h'?: number; '3h'?: number };
};

type ForecastResponse = {
  list?: Array<{
    dt?: number;
    main?: { temp?: number };
    weather?: Array<{ id?: number; description?: string }>;
    rain?: { '3h'?: number };
    snow?: { '3h'?: number };
  }>;
};

function openWeatherUrl(path: string, location: GeocodedLocation): URL {
  const url = new URL(`https://api.openweathermap.org${path}`);
  url.searchParams.set('lat', String(location.latitude));
  url.searchParams.set('lon', String(location.longitude));
  url.searchParams.set('units', 'metric');
  url.searchParams.set('appid', getOpenWeatherApiKey());
  return url;
}

async function fetchJson<T>(url: URL): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(12_000),
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
  } catch {
    throw new AppError(
      'WEATHER_UNAVAILABLE',
      'Live weather service is unreachable. Try again shortly.',
      503
    );
  }
  if (!response.ok) {
    throw new AppError('WEATHER_FAILED', 'Live weather request failed. Try again shortly.', 502);
  }
  return (await response.json()) as T;
}

/** Fetch live current conditions and 15-hour forecast from OpenWeather. */
export async function fetchLiveWeather(location: GeocodedLocation): Promise<WeatherBundle> {
  const t0 = Date.now();
  const cacheKey = weatherCacheKey(location.latitude, location.longitude);
  const cached = cacheGet<WeatherBundle>(cacheKey);
  if (cached) {
    return {
      ...cached,
      weatherMs: Date.now() - t0,
      weather: {
        ...cached.weather,
        locationLabel: location.label,
      },
    };
  }

  const [current, forecast] = await Promise.all([
    fetchJson<CurrentResponse>(openWeatherUrl('/data/2.5/weather', location)),
    fetchJson<ForecastResponse>(openWeatherUrl('/data/2.5/forecast', location)),
  ]);

  const temperature = current.main?.temp;
  const code = current.weather?.[0]?.id;
  if (typeof temperature !== 'number' || typeof code !== 'number') {
    throw new AppError('WEATHER_INCOMPLETE', 'Live weather returned incomplete conditions.', 502);
  }

  const observedAt = new Date((current.dt ?? Date.now() / 1000) * 1000).toISOString();
  const nextHours: LiveWeatherSnapshot['nextHours'] = (forecast.list ?? [])
    .slice(0, 5)
    .map((slot) => ({
      time: new Date((slot.dt ?? Date.now() / 1000) * 1000).toISOString(),
      tempC: slot.main?.temp ?? temperature,
      precipMm: slot.rain?.['3h'] ?? slot.snow?.['3h'] ?? 0,
      description:
        slot.weather?.[0]?.description || describeWeatherCode(slot.weather?.[0]?.id ?? 0),
    }));
  const precipNext = nextHours.reduce((sum, hour) => sum + hour.precipMm, 0);
  const forecastSummary = nextHours.length
    ? `Next 15 hours: ${nextHours
        .slice(0, 4)
        .map((hour) => `${hour.description} (${Math.round(hour.tempC)}°C, ${hour.precipMm}mm)`)
        .join('; ')}. Forecast precipitation total: ${precipNext.toFixed(1)} mm.`
    : 'Hourly forecast is unavailable; use current conditions only.';

  const weather: LiveWeatherSnapshot = {
    provider: 'OpenWeather',
    locationLabel: location.label,
    latitude: Math.round(location.latitude * 1000) / 1000,
    longitude: Math.round(location.longitude * 1000) / 1000,
    temperatureC: temperature,
    humidityPct: current.main?.humidity ?? 0,
    precipitationMm: current.rain?.['1h'] ?? current.snow?.['1h'] ?? 0,
    weatherCode: code,
    weatherDescription:
      current.weather?.[0]?.description || describeWeatherCode(code),
    windSpeedKmh: (current.wind?.speed ?? 0) * 3.6,
    observedAt,
    forecastSummary,
    nextHours,
  };

  const sources: Evidence[] = [
    {
      id: 'w-current-1',
      kind: 'weather',
      observedAt,
      text: `Current at ${location.label}: ${weather.weatherDescription}, ${weather.temperatureC}°C, humidity ${weather.humidityPct}%, precipitation ${weather.precipitationMm}mm, wind ${weather.windSpeedKmh.toFixed(1)} km/h.`,
      publisher: 'OpenWeather',
    },
    {
      id: 'w-forecast-1',
      kind: 'weather',
      observedAt,
      text: forecastSummary,
      publisher: 'OpenWeather',
    },
  ];

  const bundle: WeatherBundle = {
    weather,
    sources,
    alertState: 'unavailable',
    alertSummary:
      'An official IMD/NDMA alert feed is not connected, so no alert status is inferred from weather alone. Follow official authority channels for warnings.',
    weatherMs: Date.now() - t0,
  };
  cacheSet(cacheKey, bundle, WEATHER_TTL_MS);
  return bundle;
}

/** Add coarse destination context without ever claiming road safety or passability. */
export async function buildTravelEvidence(
  origin: GeocodedLocation,
  destinationLabel: string
): Promise<Evidence> {
  const { geocodeLocality } = await import('@/lib/geocode');
  try {
    const destination = await geocodeLocality(destinationLabel);
    const km = haversineKm(
      origin.latitude,
      origin.longitude,
      destination.latitude,
      destination.longitude
    );
    return {
      id: 'r-dest-1',
      kind: 'route',
      observedAt: new Date().toISOString(),
      text: `Destination resolved as ${destination.label}. Straight-line distance is approximately ${km.toFixed(1)} km. This is not traffic, flood, road-open, or passability evidence.`,
      publisher: 'OpenWeather Geocoding + MonsoonSathi distance calculation',
    };
  } catch {
    return {
      id: 'r-dest-1',
      kind: 'route',
      observedAt: new Date().toISOString(),
      text: `Destination “${destinationLabel}” could not be resolved. Travel guidance must report insufficient data unless live weather supports delay or reconsideration.`,
      publisher: 'MonsoonSathi route context',
    };
  }
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
