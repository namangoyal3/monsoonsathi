import { getGeminiApiKey, getGeminiModel } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { GeneratedPlanSchema } from '@/lib/schema';
import { buildSystemPrompt, buildUserPrompt } from '@/lib/prompt';
import {
  sanitizePlanSourceIds,
  validatePlanSemantics,
} from '@/lib/validate-plan';
import type { Evidence, GeneratedPlan, Profile } from '@/types/contract';

export function extractJson(text: string): string {
  const stripped = text.replace(/```(?:json)?/gi, '').trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return stripped;
  return stripped.slice(start, end + 1);
}

/** Coerce common model drift into allowed enums before Zod. */
export function coercePlanShape(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const root = { ...(input as Record<string, unknown>) };

  const mapPriority = (v: unknown): string => {
    const s = String(v ?? 'normal').toLowerCase().trim();
    if (s === 'critical' || s === 'urgent' || s === 'emergency') return 'critical';
    if (s === 'high' || s === 'medium-high' || s === 'important') return 'high';
    if (s === 'medium' || s === 'moderate' || s === 'low' || s === 'normal') return 'normal';
    return 'normal';
  };

  const mapTimeframe = (v: unknown): string => {
    const s = String(v ?? 'today').toLowerCase().trim().replace(/\s+/g, '_');
    if (['now', 'immediate', 'asap'].includes(s)) return 'now';
    if (['next_hour', 'next-hour', 'within_hour', '1h'].includes(s)) return 'next_hour';
    if (['today', 'this_day', 'same_day'].includes(s)) return 'today';
    if (['before_travel', 'pre_travel', 'travel'].includes(s)) return 'before_travel';
    if (['after_event', 'after', 'recovery', 'post'].includes(s)) return 'after_event';
    return 'today';
  };

  const mapBasis = (v: unknown): string => {
    const s = String(v ?? 'weather').toLowerCase().trim();
    if (s.includes('alert')) return 'official_alert';
    if (s.includes('route') || s.includes('travel')) return 'route';
    if (s.includes('profile') || s.includes('household') || s.includes('family'))
      return 'profile';
    if (s.includes('guidance') || s.includes('ndma') || s.includes('official'))
      return 'official_guidance';
    return 'weather';
  };

  const mapActionState = (v: unknown): string => {
    const s = String(v ?? 'prepare').toLowerCase().trim();
    if (['prepare', 'preparing', 'prep'].includes(s)) return 'prepare';
    if (['monitor', 'monitoring', 'watch'].includes(s)) return 'monitor';
    if (['act', 'action', 'take_action', 'respond'].includes(s)) return 'act';
    if (['recover', 'recovery', 'after'].includes(s)) return 'recover';
    return 'prepare';
  };

  const mapTravelRec = (v: unknown): string => {
    const s = String(v ?? 'insufficient_data').toLowerCase().trim().replace(/\s+/g, '_');
    if (['go', 'proceed', 'proceed_with_caution', 'ok'].includes(s)) return 'go';
    if (['delay', 'delay_if_possible', 'wait'].includes(s)) return 'delay';
    if (['reconsider', 'avoid', 'avoid_non_essential_travel', 'dont_go', "don't_go"].includes(s))
      return 'reconsider';
    return 'insufficient_data';
  };

  const fixAction = (a: unknown): unknown => {
    if (!a || typeof a !== 'object') return a;
    const o = { ...(a as Record<string, unknown>) };
    o.priority = mapPriority(o.priority);
    o.timeframe = mapTimeframe(o.timeframe);
    o.basis = mapBasis(o.basis);
    if (!Array.isArray(o.sourceIds)) o.sourceIds = [];
    o.sourceIds = (o.sourceIds as unknown[]).map(String).slice(0, 8);
    o.title = String(o.title ?? 'Action').slice(0, 100);
    o.instruction = String(o.instruction ?? o.title).slice(0, 350);
    o.reason = String(o.reason ?? 'Based on current conditions.').slice(0, 300);
    o.appliesTo = String(o.appliesTo ?? 'household').slice(0, 80);
    return o;
  };

  const fixArr = (key: string, min = 0, max = 8) => {
    const arr = Array.isArray(root[key]) ? (root[key] as unknown[]) : [];
    root[key] = arr.map(fixAction).slice(0, max);
    if ((root[key] as unknown[]).length < min && arr.length === 0) {
      // leave empty — schema will fail honestly
    }
  };

  root.actionState = mapActionState(root.actionState);
  fixArr('doNow', 1, 3);
  fixArr('doNext', 1, 4);
  fixArr('checklist', 4, 8);
  fixArr('selectedPhase', 1, 4);
  fixArr('supportActions', 0, 4);

  if (root.travel && typeof root.travel === 'object') {
    const t = { ...(root.travel as Record<string, unknown>) };
    t.recommendation = mapTravelRec(t.recommendation);
    t.reason = String(t.reason ?? 'Travel conditions need caution.').slice(0, 400);
    t.cautions = Array.isArray(t.cautions)
      ? (t.cautions as unknown[]).map((c) => String(c).slice(0, 200)).slice(0, 3)
      : [];
    t.sourceIds = Array.isArray(t.sourceIds)
      ? (t.sourceIds as unknown[]).map(String).slice(0, 8)
      : [];
    root.travel = t;
  }

  if (!root.otherPhaseSummaries || typeof root.otherPhaseSummaries !== 'object') {
    root.otherPhaseSummaries = {
      before: 'Prepare supplies and review shelter options.',
      during: 'Prioritize safety and stay informed.',
      after: 'Check for damage and restore essentials carefully.',
    };
  } else {
    const o = root.otherPhaseSummaries as Record<string, unknown>;
    root.otherPhaseSummaries = {
      before: String(o.before ?? 'Prepare early.').slice(0, 300),
      during: String(o.during ?? 'Stay safe.').slice(0, 300),
      after: String(o.after ?? 'Recover carefully.').slice(0, 300),
    };
  }

  root.interpretation = String(root.interpretation ?? 'Conditions require awareness.').slice(
    0,
    800
  );
  root.whyPrioritized = String(
    root.whyPrioritized ?? 'Prioritized from live weather and your profile.'
  ).slice(0, 500);
  root.assumptions = Array.isArray(root.assumptions)
    ? (root.assumptions as unknown[]).map((a) => String(a).slice(0, 200)).slice(0, 4)
    : [];
  root.limitations = Array.isArray(root.limitations)
    ? (root.limitations as unknown[]).map((a) => String(a).slice(0, 200)).slice(0, 4)
    : ['Not a substitute for official emergency instructions.'];
  if ((root.limitations as unknown[]).length === 0) {
    root.limitations = ['Not a substitute for official emergency instructions.'];
  }

  // Ensure min array lengths with safe filler from weather basis if model under-delivered
  const ensureMin = (key: string, min: number, titlePrefix: string) => {
    const arr = root[key] as unknown[];
    while (arr.length < min) {
      arr.push(
        fixAction({
          priority: 'normal',
          title: `${titlePrefix} ${arr.length + 1}`,
          instruction: 'Follow local official guidance and stay weather-aware.',
          reason: 'Ensures a complete minimum plan when model output was short.',
          appliesTo: 'household',
          timeframe: 'today',
          basis: 'official_guidance',
          sourceIds: ['g-ndma-1'],
        })
      );
    }
  };
  ensureMin('doNow', 1, 'Immediate action');
  ensureMin('doNext', 1, 'Next step');
  ensureMin('checklist', 4, 'Checklist item');
  ensureMin('selectedPhase', 1, 'Phase action');

  return root;
}

function parsePlan(raw: string): GeneratedPlan {
  let obj: unknown;
  try {
    obj = JSON.parse(extractJson(raw));
  } catch (e) {
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
      .slice(0, 6)
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new AppError(
      'GEMINI_SCHEMA',
      `Model output failed schema validation: ${issues}`,
      502
    );
  }
  return result.data;
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
          temperature: 0.35,
        },
      }),
      signal: AbortSignal.timeout(45_000),
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new AppError(
      'GEMINI_HTTP',
      `Gemini request failed (HTTP ${res.status}). ${body.slice(0, 120)}`,
      502
    );
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    promptFeedback?: { blockReason?: string };
  };

  if (data.promptFeedback?.blockReason) {
    throw new AppError(
      'GEMINI_BLOCKED',
      `Gemini blocked the request: ${data.promptFeedback.blockReason}`,
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
}

export async function generateMonsoonPlan(
  profile: Profile,
  evidence: Evidence[],
  alertState: string,
  alertSummary: string
): Promise<GeneratePlanResult> {
  const t0 = Date.now();
  const system = buildSystemPrompt();
  const user = buildUserPrompt(profile, evidence, alertState, alertSummary);

  let raw: string;
  try {
    raw = await geminiComplete(system, user);
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(
      'GEMINI_UNAVAILABLE',
      `Gemini is unavailable: ${e instanceof Error ? e.message : String(e)}`,
      503
    );
  }

  let plan = parsePlan(raw);

  // If destination missing, force travel null
  if (!profile.destination?.trim()) {
    plan = { ...plan, travel: null };
  }

  // Soft-sanitize unknown source IDs then hard-validate dangerous content
  plan = sanitizePlanSourceIds(plan, evidence);

  const semantic = validatePlanSemantics(plan, evidence, {
    hasDestination: Boolean(profile.destination?.trim()),
    alertState,
  });

  // Hard-fail only on safety-critical reasons; re-sanitize official_alert soft issues
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
      `Personalized guidance failed safety validation (${hard[0]}). Live weather is still shown; try again.`,
      502
    );
  }

  // Strip official_alert basis when no active alert (soft repair)
  if (alertState !== 'active') {
    const fix = <T extends { basis: string; sourceIds: string[] }>(a: T): T => {
      if (a.basis !== 'official_alert') return a;
      return {
        ...a,
        basis: 'weather',
        sourceIds:
          a.sourceIds.length > 0
            ? a.sourceIds
            : [evidence.find((e) => e.kind === 'weather')?.id ?? 'w-current-1'],
      };
    };
    plan = {
      ...plan,
      doNow: plan.doNow.map(fix),
      doNext: plan.doNext.map(fix),
      checklist: plan.checklist.map(fix),
      selectedPhase: plan.selectedPhase.map(fix),
      supportActions: plan.supportActions.map(fix),
    };
  }

  return { plan, geminiMs: Date.now() - t0 };
}
