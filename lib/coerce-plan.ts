import { AppError } from '@/lib/errors';
import { GeneratedPlanSchema } from '@/lib/schema';
import type { GeneratedPlan } from '@/types/contract';

/** Strip markdown fences and extract the outermost JSON object. */
export function extractJson(text: string): string {
  const stripped = text.replace(/```(?:json)?/gi, '').trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return stripped;
  return stripped.slice(start, end + 1);
}

/**
 * Normalize model enum/string drift only.
 * Does not invent user-facing plan content. Incomplete output fails Zod/completeness.
 *
 * Domain rule: model "go" / "proceed" maps to delay — we never affirm roads are clear.
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

  /** Never emit "go" — product policy forbids affirmative road clearance. */
  const mapTravelRec = (v: unknown): string => {
    const s = String(v ?? '').toLowerCase().trim().replace(/\s+/g, '_');
    if (['go', 'proceed', 'proceed_with_caution', 'ok', 'safe'].includes(s)) {
      return 'delay';
    }
    if (['delay', 'delay_if_possible', 'wait'].includes(s)) return 'delay';
    if (
      [
        'reconsider',
        'avoid',
        'avoid_non_essential_travel',
        'dont_go',
        "don't_go",
      ].includes(s)
    ) {
      return 'reconsider';
    }
    if (['insufficient_data', 'unknown', 'unclear'].includes(s)) {
      return 'insufficient_data';
    }
    return s;
  };

  const fixAction = (a: unknown): unknown | null => {
    if (!a || typeof a !== 'object') return null;
    const o = { ...(a as Record<string, unknown>) };
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

export function parsePlan(raw: string): GeneratedPlan {
  let obj: unknown;
  try {
    obj = JSON.parse(extractJson(raw));
  } catch (e) {
    console.error(
      JSON.stringify({
        code: 'GEMINI_INVALID_JSON_DETAIL',
        outputLength: raw.length,
        errorName: e instanceof Error ? e.name : 'UnknownError',
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
