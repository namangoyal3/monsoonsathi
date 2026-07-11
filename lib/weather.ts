import { getOpenWeatherApiKey } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { cacheGet, cacheSet, weatherCacheKey } from '@/lib/cache';
import type { GeocodedLocation } from '@/lib/geocode';
import type {
  AlertState,
  Evidence,
  LiveWeatherSnapshot,
  TransportMode,
  WeatherRisk,
} from '@/types/contract';

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

/**
 * Deterministic monsoon risk from live OpenWeather codes + precip/wind.
 * This is NOT an official IMD/NDMA bulletin — labeled as weather-derived risk.
 */
export function classifyWeatherRisk(input: {
  weatherCode: number;
  precipitationMm: number;
  windSpeedKmh: number;
  forecastPrecipMm: number;
}): { risk: WeatherRisk; summary: string } {
  const { weatherCode: code, precipitationMm, windSpeedKmh, forecastPrecipMm } =
    input;
  const thunder = code >= 200 && code < 300;
  const heavyRain = code >= 502 && code < 600;
  const rain = code >= 500 && code < 600;
  const extremeWind = windSpeedKmh >= 60;
  const strongWind = windSpeedKmh >= 40;
  const heavyPrecip =
    precipitationMm >= 8 || forecastPrecipMm >= 15;

  if (thunder || heavyRain || extremeWind || (rain && heavyPrecip)) {
    return {
      risk: 'severe',
      summary:
        'Live weather indicates elevated monsoon hazard (thunderstorm, heavy rain, and/or strong wind). This is a weather-derived risk signal from OpenWeather — not an official IMD/NDMA bulletin.',
    };
  }
  if (rain || strongWind || forecastPrecipMm >= 5 || precipitationMm >= 2) {
    return {
      risk: 'elevated',
      summary:
        'Live weather shows rain or stronger winds that can affect travel and outdoor plans. Weather-derived risk only — check IMD/NDMA for official warnings.',
    };
  }
  return {
    risk: 'normal',
    summary:
      'Live weather does not show heavy rain or thunderstorm codes right now. Stay alert to official channels; conditions can change quickly in monsoon season.',
  };
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

type OneCallResponse = {
  alerts?: Array<{
    sender_name?: string;
    event?: string;
    start?: number;
    end?: number;
    description?: string;
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

async function fetchJson<T>(url: URL, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(12_000)])
        : AbortSignal.timeout(12_000),
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
    throw new AppError(
      'WEATHER_FAILED',
      'Live weather request failed. Try again shortly.',
      502
    );
  }
  try {
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object') throw new TypeError('Invalid JSON shape');
    return data as T;
  } catch {
    throw new AppError(
      'WEATHER_FAILED',
      'Live weather returned an invalid response. Try again shortly.',
      502
    );
  }
}

/** Best-effort official/publisher alerts via OpenWeather One Call (may be unavailable on free keys). */
async function tryFetchPublisherAlerts(
  location: GeocodedLocation,
  signal?: AbortSignal
): Promise<{ alerts: Evidence[]; state: AlertState; summary: string } | null> {
  // One Call 3.0 often requires a paid plan; fail soft if unauthorized.
  const url = openWeatherUrl('/data/3.0/onecall', location);
  url.searchParams.set('exclude', 'minutely,hourly,daily');
  try {
    const res = await fetch(url.toString(), {
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(8_000)])
        : AbortSignal.timeout(8_000),
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as OneCallResponse;
    const list = data.alerts ?? [];
    if (list.length === 0) {
      return {
        alerts: [],
        state: 'none',
        summary:
          'OpenWeather alert lookup returned no active publisher alerts for this location.',
      };
    }
    const evidence: Evidence[] = list.slice(0, 3).map((a, i) => ({
      id: `a-pub-${i + 1}`,
      kind: 'official_alert' as const,
      observedAt: a.start
        ? new Date(a.start * 1000).toISOString()
        : new Date().toISOString(),
      expiresAt: a.end ? new Date(a.end * 1000).toISOString() : undefined,
      text: `${a.event ?? 'Alert'} from ${a.sender_name ?? 'weather publisher'}: ${(a.description ?? '').slice(0, 280)}`,
      publisher: a.sender_name ?? 'OpenWeather alerts',
    }));
    return {
      alerts: evidence,
      state: 'active',
      summary: `${evidence.length} active weather publisher alert(s) returned by OpenWeather. Still cross-check IMD/NDMA for India-specific bulletins.`,
    };
  } catch {
    return null;
  }
}

/** Fetch live current conditions and short forecast from OpenWeather. */
export async function fetchLiveWeather(
  location: GeocodedLocation,
  signal?: AbortSignal
): Promise<WeatherBundle> {
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
      sources: cached.sources.map((source) =>
        source.id === 'w-current-1'
          ? {
              ...source,
              text: `Current at ${location.label}: ${cached.weather.weatherDescription}, ${cached.weather.temperatureC}°C, humidity ${cached.weather.humidityPct}%, precipitation ${cached.weather.precipitationMm}mm, wind ${cached.weather.windSpeedKmh.toFixed(1)} km/h.`,
            }
          : source
      ),
    };
  }

  const [current, forecast, publisher] = await Promise.all([
    fetchJson<CurrentResponse>(openWeatherUrl('/data/2.5/weather', location), signal),
    fetchJson<ForecastResponse>(
      openWeatherUrl('/data/2.5/forecast', location),
      signal
    ),
    tryFetchPublisherAlerts(location, signal),
  ]);

  const temperature = current.main?.temp;
  const code = current.weather?.[0]?.id;
  if (typeof temperature !== 'number' || typeof code !== 'number') {
    throw new AppError(
      'WEATHER_INCOMPLETE',
      'Live weather returned incomplete conditions.',
      502
    );
  }

  const observedAt = new Date(
    (current.dt ?? Date.now() / 1000) * 1000
  ).toISOString();
  const nextHours: LiveWeatherSnapshot['nextHours'] = (forecast.list ?? [])
    .slice(0, 5)
    .map((slot) => ({
      time: new Date((slot.dt ?? Date.now() / 1000) * 1000).toISOString(),
      tempC: slot.main?.temp ?? temperature,
      precipMm: slot.rain?.['3h'] ?? slot.snow?.['3h'] ?? 0,
      description:
        slot.weather?.[0]?.description ||
        describeWeatherCode(slot.weather?.[0]?.id ?? 0),
    }));
  const precipNext = nextHours.reduce((sum, hour) => sum + hour.precipMm, 0);
  const precipitationMm =
    current.rain?.['1h'] ?? current.snow?.['1h'] ?? 0;
  const windSpeedKmh = (current.wind?.speed ?? 0) * 3.6;

  const risk = classifyWeatherRisk({
    weatherCode: code,
    precipitationMm,
    windSpeedKmh,
    forecastPrecipMm: precipNext,
  });

  const forecastSummary = nextHours.length
    ? `Next hours: ${nextHours
        .slice(0, 4)
        .map(
          (hour) =>
            `${hour.description} (${Math.round(hour.tempC)}°C, ${hour.precipMm}mm)`
        )
        .join('; ')}. Forecast precip total ≈ ${precipNext.toFixed(1)} mm. Weather risk: ${risk.risk}.`
    : `Hourly forecast limited. Weather risk: ${risk.risk}.`;

  const weather: LiveWeatherSnapshot = {
    provider: 'OpenWeather',
    locationLabel: location.label,
    latitude: Math.round(location.latitude * 1000) / 1000,
    longitude: Math.round(location.longitude * 1000) / 1000,
    temperatureC: temperature,
    humidityPct: current.main?.humidity ?? 0,
    precipitationMm,
    weatherCode: code,
    weatherDescription:
      current.weather?.[0]?.description || describeWeatherCode(code),
    windSpeedKmh,
    observedAt,
    forecastSummary,
    nextHours,
    weatherRisk: risk.risk,
    weatherRiskSummary: risk.summary,
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
    {
      id: 'w-risk-1',
      kind: 'weather',
      observedAt,
      text: `Weather-derived monsoon risk level: ${risk.risk}. ${risk.summary}`,
      publisher: 'MonsoonSathi risk classifier (from live OpenWeather)',
    },
  ];

  let alertState: AlertState = 'none';
  let alertSummary = risk.summary;
  if (publisher) {
    if (publisher.alerts.length) {
      sources.push(...publisher.alerts);
      alertState = 'active';
      alertSummary = `${publisher.summary} Additionally: ${risk.summary}`;
    } else {
      alertState = publisher.state;
      alertSummary = `${publisher.summary} ${risk.summary}`;
    }
  } else {
    // Publisher alert feed not available on this key — do not invent official alerts.
    // Use weather-derived risk for preparedness; label honestly.
    alertState = 'unavailable';
    alertSummary = `No OpenWeather publisher alert feed available on this API plan. ${risk.summary} Follow IMD/NDMA for official India bulletins.`;
  }

  const bundle: WeatherBundle = {
    weather,
    sources,
    alertState,
    alertSummary,
    weatherMs: Date.now() - t0,
  };
  cacheSet(cacheKey, bundle, WEATHER_TTL_MS);
  return bundle;
}

/** Destination context: geocode + optional OSRM driving duration (never flood safety). */
export async function buildTravelEvidence(
  origin: GeocodedLocation,
  destinationLabel: string,
  transportMode: TransportMode,
  signal?: AbortSignal
): Promise<Evidence> {
  const { geocodeLocality } = await import('@/lib/geocode');
  try {
    const destination = await geocodeLocality(destinationLabel, signal);
    const km = haversineKm(
      origin.latitude,
      origin.longitude,
      destination.latitude,
      destination.longitude
    );

    let routeNote = `No live ${transportMode.replace('_', ' ')} routing is available; using straight-line distance only.`;
    if (transportMode === 'car') {
      try {
        const osrm = new URL(
          `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`
        );
        osrm.searchParams.set('overview', 'false');
        const res = await fetch(osrm.toString(), {
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(8_000)])
            : AbortSignal.timeout(8_000),
          headers: { Accept: 'application/json' },
        });
        if (res.ok) {
          const data = (await res.json()) as {
            routes?: Array<{ duration?: number; distance?: number }>;
          };
          const route = data.routes?.[0];
          if (route?.duration != null) {
            const mins = Math.round(route.duration / 60);
            const roadKm = route.distance
              ? (route.distance / 1000).toFixed(1)
              : km.toFixed(1);
            routeNote = `OSRM driving estimate ≈ ${mins} minutes over ~${roadKm} km road distance (traffic-unaware, not flood-safe, not a guarantee roads are open).`;
          }
        }
      } catch {
        // keep distance-only note
      }
    }

    return {
      id: 'r-dest-1',
      kind: 'route',
      observedAt: new Date().toISOString(),
      text: `Destination resolved as ${destination.label}. Straight-line distance ≈ ${km.toFixed(1)} km. ${routeNote} Never claim flood-safe or passable roads from this data.`,
      publisher:
        transportMode === 'car'
          ? 'OpenWeather Geocoding + OSRM (public routing)'
          : 'OpenWeather Geocoding',
    };
  } catch {
    return {
      id: 'r-dest-1',
      kind: 'route',
      observedAt: new Date().toISOString(),
      text: 'The requested destination could not be resolved. Travel guidance must use insufficient_data unless live weather alone justifies delay/reconsider.',
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
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
