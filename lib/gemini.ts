import { getGeminiApiKey, getGeminiModel } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { GeneratedPlanSchema } from '@/lib/schema';
import { buildSystemPrompt, buildUserPrompt } from '@/lib/prompt';
import {
  sanitizePlanSourceIds,
  validatePlanSemantics,
} from '@/lib/validate-plan';
import type { Evidence, GeneratedPlan, Profile } from '@/types/contract';

/**
 * Compact Gemini response schema (hand-written).
 * Avoids Zod→JSONSchema state explosions; server still Zod-validates after generation.
 * No min/max item counts here — those are enforced post-parse.
 */
const GEMINI_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    actionState: {
      type: 'string',
      enum: ['prepare', 'monitor', 'act', 'recover'],
    },
    interpretation: { type: 'string' },
    whyPrioritized: { type: 'string' },
    doNow: { type: 'array', items: { $ref: '#/$defs/action' } },
    doNext: { type: 'array', items: { $ref: '#/$defs/action' } },
    checklist: { type: 'array', items: { $ref: '#/$defs/action' } },
    selectedPhase: { type: 'array', items: { $ref: '#/$defs/action' } },
    supportActions: { type: 'array', items: { $ref: '#/$defs/action' } },
    travel: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          properties: {
            recommendation: {
              type: 'string',
              enum: ['go', 'delay', 'reconsider', 'insufficient_data'],
            },
            reason: { type: 'string' },
            cautions: { type: 'array', items: { type: 'string' } },
            sourceIds: { type: 'array', items: { type: 'string' } },
          },
          required: ['recommendation', 'reason', 'cautions', 'sourceIds'],
        },
      ],
    },
    otherPhaseSummaries: {
      type: 'object',
      properties: {
        before: { type: 'string' },
        during: { type: 'string' },
        after: { type: 'string' },
      },
      required: ['before', 'during', 'after'],
    },
    assumptions: { type: 'array', items: { type: 'string' } },
    limitations: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'actionState',
    'interpretation',
    'whyPrioritized',
    'doNow',
    'doNext',
    'checklist',
    'selectedPhase',
    'supportActions',
    'travel',
    'otherPhaseSummaries',
    'assumptions',
    'limitations',
  ],
  $defs: {
    action: {
      type: 'object',
      properties: {
        priority: { type: 'string', enum: ['critical', 'high', 'normal'] },
        title: { type: 'string' },
        instruction: { type: 'string' },
        reason: { type: 'string' },
        appliesTo: { type: 'string' },
        timeframe: {
          type: 'string',
          enum: ['now', 'next_hour', 'today', 'before_travel', 'after_event'],
        },
        basis: {
          type: 'string',
          enum: [
            'official_alert',
            'weather',
            'route',
            'profile',
            'official_guidance',
          ],
        },
        sourceIds: { type: 'array', items: { type: 'string' } },
      },
      required: [
        'priority',
        'title',
        'instruction',
        'reason',
        'appliesTo',
        'timeframe',
        'basis',
        'sourceIds',
      ],
    },
  },
} as const;

export function extractJson(text: string): string {
  const stripped = text.replace(/```(?:json)?/gi, '').trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return stripped;
  return stripped.slice(start, end + 1);
}

/**
 * Normalize model enum/string drift only.
 * Does NOT invent user-facing plan content, checklist items, or phase summaries.
 * Missing GenAI content fails validation so we re-call the model.
 */
export function coercePlanShape(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const root = { ...(input as Record<string, unknown>) };

  const mapPriority = (v: unknown): string => {
    const s = String(v ?? '').toLowerCase().trim();
    if (['critical', 'urgent', 'emergency'].includes(s)) return 'critical';
    if (['high', 'medium-high', 'important'].includes(s)) return 'high';
    if (['medium', 'moderate', 'low', 'normal'].includes(s)) return 'normal';
    return s;
  };

  const mapTimeframe = (v: unknown): string => {
    const s = String(v ?? '').toLowerCase().trim().replace(/\s+/g, '_');
    if (['now', 'immediate', 'asap'].includes(s)) return 'now';
    if (['next_hour', 'next-hour', 'within_hour', '1h'].includes(s)) return 'next_hour';
    if (['today', 'this_day', 'same_day'].includes(s)) return 'today';
    if (['before_travel', 'pre_travel', 'travel'].includes(s)) return 'before_travel';
    if (['after_event', 'after', 'recovery', 'post'].includes(s)) return 'after_event';
    return s;
  };

  const mapBasis = (v: unknown): string => {
    const s = String(v ?? '').toLowerCase().trim();
    if (s.includes('alert')) return 'official_alert';
    if (s.includes('route') || s.includes('travel')) return 'route';
    if (s.includes('profile') || s.includes('household') || s.includes('family'))
      return 'profile';
    if (s.includes('guidance') || s.includes('ndma') || s.includes('official'))
      return 'official_guidance';
    if (s.includes('weather')) return 'weather';
    return s;
  };

  const mapActionState = (v: unknown): string => {
    const s = String(v ?? '').toLowerCase().trim();
    if (['prepare', 'preparing', 'prep'].includes(s)) return 'prepare';
    if (['monitor', 'monitoring', 'watch'].includes(s)) return 'monitor';
    if (['act', 'action', 'take_action', 'respond'].includes(s)) return 'act';
    if (['recover', 'recovery'].includes(s)) return 'recover';
    return s;
  };

  const mapTravelRec = (v: unknown): string => {
    const s = String(v ?? '').toLowerCase().trim().replace(/\s+/g, '_');
    if (['go', 'proceed', 'proceed_with_caution', 'ok'].includes(s)) return 'go';
    if (['delay', 'delay_if_possible', 'wait'].includes(s)) return 'delay';
    if (
      ['reconsider', 'avoid', 'avoid_non_essential_travel', 'dont_go', "don't_go"].includes(
        s
      )
    )
      return 'reconsider';
    if (['insufficient_data', 'unknown', 'unclear'].includes(s))
      return 'insufficient_data';
    return s;
  };

  const fixAction = (a: unknown): unknown | null => {
    if (!a || typeof a !== 'object') return null;
    const o = { ...(a as Record<string, unknown>) };
    // Require model-provided title + instruction — do not invent content
    if (!o.title || !String(o.title).trim()) return null;
    if (!o.instruction || !String(o.instruction).trim()) return null;
    o.priority = mapPriority(o.priority);
    o.timeframe = mapTimeframe(o.timeframe);
    o.basis = mapBasis(o.basis);
    o.title = String(o.title).slice(0, 100);
    o.instruction = String(o.instruction).slice(0, 350);
    if (typeof o.reason === 'string') o.reason = o.reason.slice(0, 300);
    if (typeof o.appliesTo === 'string') o.appliesTo = o.appliesTo.slice(0, 80);
    o.sourceIds = Array.isArray(o.sourceIds)
      ? (o.sourceIds as unknown[]).map(String).filter(Boolean).slice(0, 8)
      : [];
    return o;
  };

  const fixArr = (key: string, max: number) => {
    const arr = Array.isArray(root[key]) ? (root[key] as unknown[]) : [];
    root[key] = arr.map(fixAction).filter(Boolean).slice(0, max);
  };

  if (root.actionState !== undefined) {
    root.actionState = mapActionState(root.actionState);
  }
  if (typeof root.interpretation === 'string') {
    root.interpretation = root.interpretation.slice(0, 800);
  }
  if (typeof root.whyPrioritized === 'string') {
    root.whyPrioritized = root.whyPrioritized.slice(0, 500);
  }

  fixArr('doNow', 3);
  fixArr('doNext', 4);
  fixArr('checklist', 6);
  fixArr('selectedPhase', 3);
  fixArr('supportActions', 4);

  if (root.travel && typeof root.travel === 'object') {
    const t = { ...(root.travel as Record<string, unknown>) };
    t.recommendation = mapTravelRec(t.recommendation);
    if (typeof t.reason === 'string') t.reason = t.reason.slice(0, 400);
    t.cautions = Array.isArray(t.cautions)
      ? (t.cautions as unknown[]).map((c) => String(c).slice(0, 200)).slice(0, 3)
      : [];
    t.sourceIds = Array.isArray(t.sourceIds)
      ? (t.sourceIds as unknown[]).map(String).filter(Boolean).slice(0, 8)
      : [];
    root.travel = t;
  }

  if (root.otherPhaseSummaries && typeof root.otherPhaseSummaries === 'object') {
    const o = root.otherPhaseSummaries as Record<string, unknown>;
    root.otherPhaseSummaries = {
      before: typeof o.before === 'string' ? o.before.slice(0, 300) : o.before,
      during: typeof o.during === 'string' ? o.during.slice(0, 300) : o.during,
      after: typeof o.after === 'string' ? o.after.slice(0, 300) : o.after,
    };
  }

  if (Array.isArray(root.assumptions)) {
    root.assumptions = (root.assumptions as unknown[])
      .map((a) => String(a).slice(0, 200))
      .slice(0, 3);
  }
  if (Array.isArray(root.limitations)) {
    root.limitations = (root.limitations as unknown[])
      .map((a) => String(a).slice(0, 200))
      .slice(0, 3);
  }

  return root;
}

function parsePlan(raw: string): GeneratedPlan {
  let obj: unknown;
  try {
    obj = JSON.parse(extractJson(raw));
  } catch (e) {
    console.error(
      JSON.stringify({
        code: 'GEMINI_INVALID_JSON_DETAIL',
        sample: raw.slice(0, 240),
        err: e instanceof Error ? e.message : String(e),
      })
    );
    throw new AppError(
      'GEMINI_INVALID_JSON',
      `Model returned invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
      502
    );
  }

  obj = coercePlanShape(obj);
  const result = GeneratedPlanSchema.safeParse(obj);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 8)
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    console.error(JSON.stringify({ code: 'GEMINI_SCHEMA_DETAIL', issues }));
    throw new AppError(
      'GEMINI_SCHEMA',
      `Model output failed schema validation: ${issues}`,
      502
    );
  }
  return result.data;
}

/**
 * Extra GenAI completeness checks — fails closed instead of injecting hardcoded actions.
 */
export function assertGenAiCompleteness(
  plan: GeneratedPlan,
  profile: Profile
): void {
  if (!plan.interpretation.trim() || !plan.whyPrioritized.trim()) {
    throw new AppError(
      'GEMINI_INCOMPLETE',
      'Model omitted interpretation fields.',
      502
    );
  }
  if (plan.doNow.length < 1 || plan.doNext.length < 1) {
    throw new AppError(
      'GEMINI_INCOMPLETE',
      'Model omitted required action lists.',
      502
    );
  }
  if (plan.checklist.length < 4) {
    throw new AppError(
      'GEMINI_INCOMPLETE',
      'Model emergency checklist incomplete.',
      502
    );
  }
  if (plan.selectedPhase.length < 1) {
    throw new AppError(
      'GEMINI_INCOMPLETE',
      'Model omitted selected-phase actions.',
      502
    );
  }
  if (
    !plan.otherPhaseSummaries.before.trim() ||
    !plan.otherPhaseSummaries.during.trim() ||
    !plan.otherPhaseSummaries.after.trim()
  ) {
    throw new AppError(
      'GEMINI_INCOMPLETE',
      'Model omitted before/during/after summaries.',
      502
    );
  }
  if (plan.limitations.length < 1) {
    throw new AppError(
      'GEMINI_INCOMPLETE',
      'Model omitted limitations.',
      502
    );
  }

  const needsSupport =
    profile.scope === 'community' ||
    profile.scope === 'family' ||
    profile.hasElderly ||
    profile.hasChildren ||
    profile.hasPregnantMember ||
    profile.hasDisabilityNeeds ||
    profile.needsEssentialMedicines ||
    profile.hasPoweredMedicalDevice ||
    profile.hasPets;

  if (needsSupport && plan.supportActions.length < 1) {
    throw new AppError(
      'GEMINI_INCOMPLETE',
      'Model omitted personalized supportActions for stated household/community needs.',
      502
    );
  }

  if (profile.destination?.trim()) {
    if (!plan.travel) {
      throw new AppError(
        'GEMINI_INCOMPLETE',
        'Model omitted required travel advisory for destination.',
        502
      );
    }
    if (!plan.travel.reason.trim()) {
      throw new AppError(
        'GEMINI_INCOMPLETE',
        'Model travel advisory missing reason.',
        502
      );
    }
  }
}

async function geminiComplete(system: string, user: string): Promise<string> {
  const key = getGeminiApiKey();
  const model = getGeminiModel();
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: GEMINI_RESPONSE_SCHEMA,
          maxOutputTokens: 4096,
          temperature: 0.35,
        },
      }),
      signal: AbortSignal.timeout(50_000),
    }
  );

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error(
      JSON.stringify({
        code: 'GEMINI_HTTP_DETAIL',
        status: res.status,
        detail: errBody.slice(0, 600),
      })
    );
    throw new AppError(
      'GEMINI_HTTP',
      res.status === 429
        ? 'The AI service is busy. Please wait a moment and try again.'
        : 'The AI service could not create a plan. Please try again.',
      res.status === 429 ? 503 : 502
    );
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    promptFeedback?: { blockReason?: string };
  };

  if (data.promptFeedback?.blockReason) {
    throw new AppError(
      'GEMINI_BLOCKED',
      'The AI service could not safely process that request. Try removing sensitive or instruction-like text.',
      502
    );
  }

  const text =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ??
    '';
  if (!text.trim()) {
    throw new AppError('GEMINI_EMPTY', 'Gemini returned an empty response.', 502);
  }
  return text;
}

export interface GeneratePlanResult {
  plan: GeneratedPlan;
  geminiMs: number;
  modelCalls: number;
}

/**
 * GenAI plan generation pipeline.
 * - Always requires a real Gemini response
 * - Never injects hardcoded checklist/actions/travel text
 * - On incomplete/invalid model output: fail honestly; never inject fallback content
 */
export async function generateMonsoonPlan(
  profile: Profile,
  evidence: Evidence[],
  alertState: string,
  alertSummary: string
): Promise<GeneratePlanResult> {
  const t0 = Date.now();
  const system = buildSystemPrompt();
  const runOnce = async (user: string): Promise<GeneratedPlan> => {
    const raw = await geminiComplete(system, user);
    const plan = parsePlan(raw);

    // Destination rule is structural (not content invention)
    if (!profile.destination?.trim()) {
      plan.travel = null;
    }

    const sanitized = sanitizePlanSourceIds(plan, evidence);
    assertGenAiCompleteness(sanitized, profile);

    const semantic = validatePlanSemantics(sanitized, evidence, {
      hasDestination: Boolean(profile.destination?.trim()),
      alertState,
    });

    const hard = semantic.reasons.filter(
      (r) =>
        r.startsWith('invented') ||
        r.startsWith('html') ||
        r.startsWith('unsupported') ||
        r.startsWith('travel_reason') ||
        r.startsWith('travel_caution') ||
        r.startsWith('travel_present')
    );
    if (hard.length) {
      throw new AppError(
        'GEMINI_UNSAFE',
        `Personalized guidance failed safety validation (${hard[0]}).`,
        502
      );
    }

    // Soft-fix official_alert basis without inventing new action text
    if (alertState !== 'active') {
      const fixBasis = <T extends { basis: string; sourceIds: string[] }>(
        a: T
      ): T => {
        if (a.basis !== 'official_alert') return a;
        const weatherId =
          evidence.find((e) => e.kind === 'weather')?.id ?? a.sourceIds[0] ?? '';
        return {
          ...a,
          basis: 'weather',
          sourceIds: a.sourceIds.length ? a.sourceIds : weatherId ? [weatherId] : [],
        };
      };
      return {
        ...sanitized,
        doNow: sanitized.doNow.map(fixBasis),
        doNext: sanitized.doNext.map(fixBasis),
        checklist: sanitized.checklist.map(fixBasis),
        selectedPhase: sanitized.selectedPhase.map(fixBasis),
        supportActions: sanitized.supportActions.map(fixBasis),
      };
    }

    return sanitized;
  };

  const plan = await runOnce(
    buildUserPrompt(profile, evidence, alertState, alertSummary)
  );
  return { plan, geminiMs: Date.now() - t0, modelCalls: 1 };
}
