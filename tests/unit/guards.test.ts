import { describe, expect, it, vi } from 'vitest';
import { ProfileSchema, GeneratedPlanSchema } from '@/lib/schema';
import { coercePlanShape, generateMonsoonPlan } from '@/lib/gemini';
import { validatePlanSemantics } from '@/lib/validate-plan';
import { classifyWeatherRisk, describeWeatherCode } from '@/lib/weather';
import { checkRateLimit } from '@/lib/rateLimit';
import { cacheGet, cacheSet, weatherCacheKey } from '@/lib/cache';
import type { WeatherBundle } from '@/lib/weather';
import { fetchLiveWeather } from '@/lib/weather';
import type { Evidence, GeneratedPlan } from '@/types/contract';

const evidence: Evidence[] = [
  {
    id: 'w-current-1',
    kind: 'weather',
    text: 'Rain 5mm',
    publisher: 'OpenWeather',
    observedAt: new Date().toISOString(),
  },
  {
    id: 'g-ndma-1',
    kind: 'official_guidance',
    text: 'Do not enter floodwater',
    publisher: 'NDMA',
  },
];

function samplePlan(overrides: Partial<GeneratedPlan> = {}): GeneratedPlan {
  const action = {
    priority: 'high' as const,
    title: 'Pack medicines',
    instruction: 'Keep medicines dry and ready.',
    reason: 'Profile needs continuity.',
    appliesTo: 'household',
    timeframe: 'now' as const,
    basis: 'profile' as const,
    sourceIds: ['w-current-1'],
  };
  return {
    actionState: 'prepare',
    interpretation: 'Prepare for rain.',
    whyPrioritized: 'Weather and profile needs.',
    doNow: [action],
    doNext: [{ ...action, title: 'Charge devices', timeframe: 'today' }],
    checklist: Array.from({ length: 4 }).map((_, i) => ({
      ...action,
      title: `Item ${i + 1}`,
      timeframe: 'today' as const,
      basis: 'official_guidance' as const,
      sourceIds: ['g-ndma-1'],
    })),
    selectedPhase: [{ ...action, title: 'Phase action' }],
    supportActions: [],
    travel: null,
    otherPhaseSummaries: {
      before: 'Prepare supplies.',
      during: 'Stay indoors if heavy rain.',
      after: 'Check carefully.',
    },
    assumptions: ['You remain at the locality.'],
    limitations: ['Not an official alert service.'],
    ...overrides,
  };
}

describe('ProfileSchema', () => {
  it('accepts individual profile', () => {
    expect(
      ProfileSchema.safeParse({
        locality: 'Bengaluru',
        scope: 'individual',
        phase: 'before',
        language: 'English',
        transportMode: 'walk',
      }).success
    ).toBe(true);
  });

  it('requires community size', () => {
    expect(
      ProfileSchema.safeParse({
        locality: 'Bengaluru',
        scope: 'community',
        phase: 'during',
        language: 'Hindi',
        transportMode: 'walk',
      }).success
    ).toBe(false);
  });
});

describe('coercePlanShape', () => {
  it('maps medium priority and Immediate timeframe without inventing actions', () => {
    const coerced = coercePlanShape({
      actionState: 'prep',
      doNow: [
        {
          priority: 'medium',
          timeframe: 'Immediate',
          basis: 'household',
          title: 'Act',
          instruction: 'Do it',
          reason: 'Because',
          appliesTo: 'you',
          sourceIds: ['w-current-1'],
        },
      ],
      doNext: [],
      checklist: [],
      selectedPhase: [],
      supportActions: [],
      travel: null,
      interpretation: 'x',
      whyPrioritized: 'y',
      otherPhaseSummaries: { before: 'a', during: 'b', after: 'c' },
      assumptions: [],
      limitations: ['limit'],
    }) as Record<string, unknown>;

    const doNow = coerced.doNow as Array<Record<string, string>>;
    expect(doNow).toHaveLength(1);
    expect(doNow[0]?.priority).toBe('normal');
    expect(doNow[0]?.timeframe).toBe('now');
    expect(doNow[0]?.basis).toBe('profile');
    expect(coerced.actionState).toBe('prepare');
    // Empty arrays stay empty — no hardcoded filler content
    expect(coerced.doNext).toEqual([]);
    expect(coerced.checklist).toEqual([]);
  });

  it('drops actions missing model-generated title/instruction', () => {
    const coerced = coercePlanShape({
      doNow: [{ priority: 'high', instruction: 'only instruction' }],
    }) as Record<string, unknown>;
    expect(coerced.doNow).toEqual([]);
  });

  it('maps affirmative travel go/proceed to delay (never road clearance)', () => {
    const coerced = coercePlanShape({
      travel: {
        recommendation: 'go',
        reason: 'Looks fine.',
        cautions: [],
        sourceIds: ['r-1'],
      },
    }) as Record<string, unknown>;
    const travel = coerced.travel as Record<string, string>;
    expect(travel.recommendation).toBe('delay');

    const proceed = coercePlanShape({
      travel: {
        recommendation: 'proceed_with_caution',
        reason: 'Maybe ok.',
        cautions: [],
        sourceIds: ['r-1'],
      },
    }) as Record<string, unknown>;
    expect((proceed.travel as Record<string, string>).recommendation).toBe(
      'delay'
    );
  });
});

describe('Gemini transient retry', () => {
  it('retries a 503 exactly once, then fails without a fallback plan', async () => {
    const originalKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'test-key';
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('', { status: 503 }));

    try {
      const pending = generateMonsoonPlan(
        {
          locality: 'Bengaluru',
          scope: 'individual',
          phase: 'before',
          language: 'English',
          transportMode: 'walk',
        },
        evidence,
        'unavailable',
        'Official alert feed unavailable.',
        new AbortController().signal
      );
      const rejected = expect(pending).rejects.toMatchObject({
        code: 'GEMINI_HTTP',
      });

      await vi.runAllTimersAsync();
      await rejected;
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      fetchMock.mockRestore();
      vi.useRealTimers();
      if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = originalKey;
    }
  });
});

describe('validatePlanSemantics', () => {
  it('accepts a grounded plan', () => {
    const plan = samplePlan();
    expect(GeneratedPlanSchema.safeParse(plan).success).toBe(true);
    const result = validatePlanSemantics(plan, evidence, {
      hasDestination: false,
      alertState: 'unavailable',
    });
    expect(result.ok).toBe(true);
  });

  it('rejects flood-safe travel claims', () => {
    const plan = samplePlan({
      travel: {
        recommendation: 'delay',
        reason: 'Route is flood-safe and guaranteed safe.',
        cautions: ['Road is open'],
        sourceIds: ['w-current-1'],
      },
    });
    const result = validatePlanSemantics(plan, evidence, {
      hasDestination: true,
      alertState: 'unavailable',
    });
    expect(result.ok).toBe(false);
    expect(
      result.reasons.some(
        (r) => r.includes('route_safety') || r.includes('unsupported')
      )
    ).toBe(true);
  });

  it('rejects travel recommendation go at the Zod schema boundary', () => {
    const plan = samplePlan({
      travel: {
        // Bypass TypeScript — models can still emit invalid enums
        recommendation: 'go' as unknown as 'delay',
        reason: 'Conditions look manageable.',
        cautions: [],
        sourceIds: ['r-1'],
      },
    });
    expect(GeneratedPlanSchema.safeParse(plan).success).toBe(false);
  });

  it('rejects phone numbers in model output', () => {
    const plan = samplePlan({ interpretation: 'Call 9876543210 for help.' });
    const result = validatePlanSemantics(plan, evidence, {
      hasDestination: false,
      alertState: 'unavailable',
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.includes('phone'))).toBe(true);
  });

  it('rejects unknown source ids instead of hiding model invention', () => {
    const dirty = samplePlan({
      doNow: [
        {
          priority: 'high',
          title: 'x',
          instruction: 'y',
          reason: 'z',
          appliesTo: 'a',
          timeframe: 'now',
          basis: 'weather',
          sourceIds: ['fake-99'],
        },
      ],
    });
    const result = validatePlanSemantics(dirty, evidence, {
      hasDestination: false,
      alertState: 'unavailable',
    });
    expect(result.reasons).toContain('unknown_source_id:fake-99');
  });

  it('accepts delay travel when route evidence is present and phrasing is safe', () => {
    const routeEvidence: Evidence[] = [
      ...evidence,
      { id: 'r-1', kind: 'route', text: 'Distance only', publisher: 'OSRM' },
    ];
    const plan = samplePlan({
      travel: {
        recommendation: 'delay',
        reason: 'Heavy rain forecast; delay non-essential travel if possible.',
        cautions: ['Avoid flooded stretches if conditions change'],
        sourceIds: ['r-1'],
      },
    });
    const result = validatePlanSemantics(plan, routeEvidence, {
      hasDestination: true,
      alertState: 'unavailable',
    });
    expect(result.ok).toBe(true);
  });

  it('rejects flood-safe travel claims in supported languages', () => {
    const routeEvidence: Evidence[] = [
      ...evidence,
      { id: 'r-1', kind: 'route', text: 'Distance only', publisher: 'OSRM' },
    ];
    const plan = samplePlan({
      travel: {
        recommendation: 'reconsider',
        reason: 'मार्ग सुरक्षित',
        cautions: [],
        sourceIds: ['r-1'],
      },
    });
    const result = validatePlanSemantics(plan, routeEvidence, {
      hasDestination: true,
      alertState: 'unavailable',
    });
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain('unsupported_route_safety_claim');
  });
});

describe('weather helpers', () => {
  it('maps rain and clear-ish codes', () => {
    expect(describeWeatherCode(500).toLowerCase()).toContain('rain');
    expect(describeWeatherCode(800).toLowerCase()).toContain('clear');
  });

  it('classifies thunderstorm as severe weather risk', () => {
    const r = classifyWeatherRisk({
      weatherCode: 202,
      precipitationMm: 1,
      windSpeedKmh: 10,
      forecastPrecipMm: 0,
    });
    expect(r.risk).toBe('severe');
    expect(r.summary.toLowerCase()).toContain('not an official');
  });

  it('classifies calm weather as normal risk', () => {
    const r = classifyWeatherRisk({
      weatherCode: 800,
      precipitationMm: 0,
      windSpeedKmh: 5,
      forecastPrecipMm: 0,
    });
    expect(r.risk).toBe('normal');
  });

  it('uses the current locality label when rounded coordinates hit cache', async () => {
    const key = weatherCacheKey(12.97161, 77.59461);
    const cached: WeatherBundle = {
      weather: {
        provider: 'OpenWeather',
        locationLabel: 'Old label',
        latitude: 12.972,
        longitude: 77.595,
        temperatureC: 24,
        humidityPct: 80,
        precipitationMm: 1,
        weatherCode: 500,
        weatherDescription: 'rain',
        windSpeedKmh: 6,
        observedAt: new Date().toISOString(),
        forecastSummary: 'Rain possible.',
        nextHours: [],
        weatherRisk: 'elevated',
        weatherRiskSummary: 'Weather-derived risk.',
      },
      sources: [
        {
          id: 'w-current-1',
          kind: 'weather',
          text: 'Current at Old label: rain.',
          publisher: 'OpenWeather',
        },
      ],
      alertState: 'none',
      alertSummary: 'No publisher alerts.',
      weatherMs: 10,
    };
    cacheSet(key, cached, 60_000);

    const result = await fetchLiveWeather({
      label: 'Current label',
      latitude: 12.97162,
      longitude: 77.59462,
    });

    expect(result.weather.locationLabel).toBe('Current label');
    expect(result.sources[0]?.text).toContain('Current at Current label');
    expect(result.sources[0]?.text).not.toContain('Old label');
  });
});

describe('cache', () => {
  it('caps public weather entries', () => {
    const prefix = `cap-${Date.now()}-${Math.random()}-`;
    for (let i = 0; i <= 500; i++) cacheSet(`${prefix}${i}`, i, 60_000);
    expect(cacheGet(`${prefix}0`)).toBeNull();
    expect(cacheGet(`${prefix}500`)).toBe(500);
  });
});

describe('rateLimit', () => {
  it('blocks after limit', () => {
    const key = `test-${Date.now()}-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit(key, 3, 60_000).ok).toBe(true);
    }
    expect(checkRateLimit(key, 3, 60_000).ok).toBe(false);
  });
});
