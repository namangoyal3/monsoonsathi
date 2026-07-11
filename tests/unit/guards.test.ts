import { describe, expect, it } from 'vitest';
import { ProfileSchema, GeneratedPlanSchema } from '@/lib/schema';
import { coercePlanShape } from '@/lib/gemini';
import {
  sanitizePlanSourceIds,
  validatePlanSemantics,
} from '@/lib/validate-plan';
import { classifyWeatherRisk, describeWeatherCode } from '@/lib/weather';
import { checkRateLimit } from '@/lib/rateLimit';
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
        recommendation: 'go',
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

  it('rejects phone numbers in model output', () => {
    const plan = samplePlan({ interpretation: 'Call 9876543210 for help.' });
    const result = validatePlanSemantics(plan, evidence, {
      hasDestination: false,
      alertState: 'unavailable',
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.includes('phone'))).toBe(true);
  });

  it('sanitizes unknown source ids', () => {
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
    const clean = sanitizePlanSourceIds(dirty, evidence);
    expect(clean.doNow[0]?.sourceIds.includes('fake-99')).toBe(false);
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
