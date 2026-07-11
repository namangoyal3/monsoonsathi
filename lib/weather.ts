import { AppError } from '@/lib/errors';
import type {
  AlertState,
  Evidence,
  LiveWeatherSnapshot,
} from '@/types/contract';
import type { GeocodedLocation } from '@/lib/geocode';

/** WMO weather interpretation codes (Open-Meteo). */
export function describeWeatherCode(code: number): string {
  const map: Record<number, string> = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    66: 'Light freezing rain',
    67: 'Heavy freezing rain',
    71: 'Slight snow',
    73: 'Moderate snow',
    75: 'Heavy snow',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail',
  };
  return map[code] ?? `Weather code ${code}`;
}

export interface WeatherBundle {
  weather: LiveWeatherSnapshot;
  sources: Evidence[];
  alertState: AlertState;
  alertSummary: string;
  weatherMs: number;
}

/**
 * Fetch live current conditions + hourly forecast from Open-Meteo.
 * Alerts: Open-Meteo does not provide India official IMD/NDMA alerts in this free endpoint,
 * so alertState is reported as `unavailable` with an honest message (never invents alerts).
 */
export async function fetchLiveWeather(
  location: GeocodedLocation
): Promise<WeatherBundle> {
  const t0 = Date.now();
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(location.latitude));
  url.searchParams.set('longitude', String(location.longitude));
  url.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m'
  );
  url.searchParams.set(
    'hourly',
    'temperature_2m,precipitation,weather_code'
  );
  url.searchParams.set('forecast_hours', '12');
  url.searchParams.set('timezone', 'auto');

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new AppError(
      'WEATHER_UNAVAILABLE',
      'Live weather service is unreachable. Personalized plan cannot be generated without live context.',
      503
    );
  }

  if (!res.ok) {
    throw new AppError(
      'WEATHER_FAILED',
      'Live weather request failed. Try again shortly.',
      502
    );
  }

  const data = (await res.json()) as {
    current?: {
      time?: string;
      temperature_2m?: number;
      relative_humidity_2m?: number;
      precipitation?: number;
      weather_code?: number;
      wind_speed_10m?: number;
    };
    hourly?: {
      time?: string[];
      temperature_2m?: number[];
      precipitation?: number[];
      weather_code?: number[];
    };
  };

  const cur = data.current;
  if (
    !cur ||
    typeof cur.temperature_2m !== 'number' ||
    typeof cur.weather_code !== 'number'
  ) {
    throw new AppError(
      'WEATHER_INCOMPLETE',
      'Live weather returned incomplete current conditions.',
      502
    );
  }

  const observedAt = cur.time
    ? new Date(cur.time).toISOString()
    : new Date().toISOString();

  const nextHours: LiveWeatherSnapshot['nextHours'] = [];
  const times = data.hourly?.time ?? [];
  for (let i = 0; i < Math.min(6, times.length); i++) {
    const code = data.hourly?.weather_code?.[i] ?? 0;
    nextHours.push({
      time: times[i]!,
      tempC: data.hourly?.temperature_2m?.[i] ?? cur.temperature_2m,
      precipMm: data.hourly?.precipitation?.[i] ?? 0,
      description: describeWeatherCode(code),
    });
  }

  const precipNext =
    nextHours.reduce((s, h) => s + (h.precipMm || 0), 0) ||
    (cur.precipitation ?? 0);
  const forecastSummary = `Next hours: ${nextHours
    .slice(0, 3)
    .map((h) => `${h.description} (${h.tempC}°C, ${h.precipMm}mm)`)
    .join('; ')}. Cumulative precip next window ≈ ${precipNext.toFixed(1)} mm.`;

  const weather: LiveWeatherSnapshot = {
    provider: 'Open-Meteo',
    locationLabel: location.label,
    latitude: Math.round(location.latitude * 1000) / 1000,
    longitude: Math.round(location.longitude * 1000) / 1000,
    temperatureC: cur.temperature_2m,
    humidityPct: cur.relative_humidity_2m ?? 0,
    precipitationMm: cur.precipitation ?? 0,
    weatherCode: cur.weather_code,
    weatherDescription: describeWeatherCode(cur.weather_code),
    windSpeedKmh: cur.wind_speed_10m ?? 0,
    observedAt,
    forecastSummary,
    nextHours,
  };

  const sources: Evidence[] = [
    {
      id: 'w-current-1',
      kind: 'weather',
      observedAt,
      text: `Current at ${location.label}: ${weather.weatherDescription}, ${weather.temperatureC}°C, humidity ${weather.humidityPct}%, precip ${weather.precipitationMm}mm, wind ${weather.windSpeedKmh} km/h.`,
      publisher: 'Open-Meteo',
    },
    {
      id: 'w-forecast-1',
      kind: 'weather',
      observedAt,
      text: forecastSummary,
      publisher: 'Open-Meteo',
    },
  ];

  // Honest alert state: free Open-Meteo forecast does not include IMD/NDMA public alerts.
  const alertState: AlertState = 'unavailable';
  const alertSummary =
    'Official India weather-alert feed is not attached in this build. No active official alert was invented. Follow IMD/NDMA/local authority channels for official warnings.';

  return {
    weather,
    sources,
    alertState,
    alertSummary,
    weatherMs: Date.now() - t0,
  };
}

/** Optional travel context when destination is provided: second geocode + rough straight-line distance. */
export async function buildTravelEvidence(
  origin: GeocodedLocation,
  destinationLabel: string
): Promise<Evidence | null> {
  const { geocodeLocality } = await import('@/lib/geocode');
  try {
    const dest = await geocodeLocality(destinationLabel);
    const km = haversineKm(
      origin.latitude,
      origin.longitude,
      dest.latitude,
      dest.longitude
    );
    return {
      id: 'r-dest-1',
      kind: 'route',
      observedAt: new Date().toISOString(),
      text: `Destination resolved as ${dest.label}. Approximate straight-line distance from origin ≈ ${km.toFixed(1)} km. This is NOT traffic, flood, or road-open status — only coarse location context.`,
      publisher: 'Open-Meteo Geocoding (distance estimate)',
    };
  } catch {
    return {
      id: 'r-dest-1',
      kind: 'route',
      observedAt: new Date().toISOString(),
      text: `Destination text provided (“${destinationLabel}”) but could not be fully resolved. Travel advice must use insufficient_data unless weather alone justifies delay.`,
      publisher: 'MonsoonSathi route context',
    };
  }
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
