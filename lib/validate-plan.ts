import type { Evidence, GeneratedPlan } from '@/types/contract';

const PHONE_RE = /\b(?:\+?\d[\d\s\-()]{7,}\d)\b/;
const URL_RE = /https?:\/\/|www\./i;
const HTML_RE = /<\/?[a-z][\s\S]*>/i;

const ROUTE_SAFETY_RE =
  /\b(flood[-\s]?safe|guaranteed safe|road is open|roads? are open|no waterlogging|completely safe|safe to drive through|drive through (?:the )?flood|enter (?:the )?floodwater)\b/i;

export interface ValidationResult {
  ok: boolean;
  reasons: string[];
}

function collectText(plan: GeneratedPlan): string {
  return JSON.stringify(plan);
}

function allSourceIds(plan: GeneratedPlan): string[] {
  const ids: string[] = [];
  const push = (arr: { sourceIds: string[] }[]) => {
    for (const a of arr) ids.push(...a.sourceIds);
  };
  push(plan.doNow);
  push(plan.doNext);
  push(plan.checklist);
  push(plan.selectedPhase);
  push(plan.supportActions);
  if (plan.travel) ids.push(...plan.travel.sourceIds);
  return ids;
}

/**
 * Semantic safety validation after Zod parse.
 * Rejects unknown sources, invented contacts, HTML, and unsupported route-safety claims.
 */
export function validatePlanSemantics(
  plan: GeneratedPlan,
  evidence: Evidence[],
  opts: { hasDestination: boolean; alertState: string }
): ValidationResult {
  const reasons: string[] = [];
  const allowed = new Set(evidence.map((e) => e.id));
  const byId = new Map(evidence.map((e) => [e.id, e]));

  for (const id of allSourceIds(plan)) {
    if (!allowed.has(id)) {
      reasons.push(`unknown_source_id:${id}`);
    }
  }

  const haystack = collectText(plan);
  if (PHONE_RE.test(haystack)) {
    reasons.push('invented_or_included_phone_number');
  }
  if (URL_RE.test(haystack) || HTML_RE.test(haystack)) {
    reasons.push('html_or_url_in_model_output');
  }
  if (ROUTE_SAFETY_RE.test(haystack)) {
    reasons.push('unsupported_route_safety_claim');
  }

  // Actions claiming official_alert basis need alert-kind evidence or active alert
  const allActions = [
    ...plan.doNow,
    ...plan.doNext,
    ...plan.checklist,
    ...plan.selectedPhase,
    ...plan.supportActions,
  ];
  for (const a of allActions) {
    if (a.basis === 'official_alert') {
      if (opts.alertState !== 'active') {
        reasons.push(`official_alert_basis_without_active_alert:${a.title}`);
      }
      const hasAlertSource = a.sourceIds.some(
        (id) => byId.get(id)?.kind === 'official_alert'
      );
      if (!hasAlertSource) {
        reasons.push(`official_alert_basis_missing_alert_source:${a.title}`);
      }
    }
    if (a.basis === 'weather') {
      const hasWeather = a.sourceIds.some((id) => byId.get(id)?.kind === 'weather');
      if (!hasWeather && a.sourceIds.length > 0) {
        // soft: allow if empty handled elsewhere; if IDs present they should match
        const onlyOk = a.sourceIds.every((id) => allowed.has(id));
        if (!onlyOk) reasons.push(`weather_basis_bad_sources:${a.title}`);
      }
    }
    if (a.basis === 'route') {
      const hasRoute = a.sourceIds.some((id) => byId.get(id)?.kind === 'route');
      if (!hasRoute) {
        reasons.push(`route_basis_without_route_source:${a.title}`);
      }
    }
  }

  if (!opts.hasDestination && plan.travel !== null) {
    reasons.push('travel_present_without_destination');
  }
  if (opts.hasDestination && plan.travel === null) {
    // Prefer having travel section; not a hard fail — model may omit
    // Soft: leave as ok
  }

  if (plan.travel) {
    if (ROUTE_SAFETY_RE.test(plan.travel.reason)) {
      reasons.push('travel_reason_route_safety_claim');
    }
    for (const c of plan.travel.cautions) {
      if (ROUTE_SAFETY_RE.test(c)) reasons.push('travel_caution_route_safety_claim');
    }
  }

  // Drop empty support is fine; require non-empty core arrays (Zod already does)

  return { ok: reasons.length === 0, reasons };
}

/**
 * Repair pass: strip unknown source IDs rather than hard-failing soft mismatches when possible.
 * Hard fails still apply for phones, HTML, route safety.
 */
export function sanitizePlanSourceIds(
  plan: GeneratedPlan,
  evidence: Evidence[]
): GeneratedPlan {
  const allowed = new Set(evidence.map((e) => e.id));
  const clean = (ids: string[]) => ids.filter((id) => allowed.has(id));
  const fixAction = <T extends { sourceIds: string[] }>(a: T): T => ({
    ...a,
    sourceIds: clean(a.sourceIds).length
      ? clean(a.sourceIds)
      : evidence.find((e) => e.kind === 'weather')
        ? [evidence.find((e) => e.kind === 'weather')!.id]
        : evidence[0]
          ? [evidence[0].id]
          : [],
  });

  return {
    ...plan,
    doNow: plan.doNow.map(fixAction),
    doNext: plan.doNext.map(fixAction),
    checklist: plan.checklist.map(fixAction),
    selectedPhase: plan.selectedPhase.map(fixAction),
    supportActions: plan.supportActions.map(fixAction),
    travel: plan.travel
      ? {
          ...plan.travel,
          sourceIds: clean(plan.travel.sourceIds),
        }
      : null,
  };
}
