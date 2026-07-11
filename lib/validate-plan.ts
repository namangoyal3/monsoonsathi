import type { Evidence, GeneratedPlan } from '@/types/contract';

const PHONE_RE = /\b(?:\+?\d[\d\s\-()]{7,}\d)\b/;
const URL_RE = /https?:\/\/|www\./i;
const HTML_RE = /<\/?[a-z][\s\S]*>/i;

const ROUTE_SAFETY_RE =
  /\b(flood[-\s]?safe|guaranteed safe|road is open|roads? are open|no waterlogging|completely safe|safe to drive through|drive through (?:the )?flood|enter (?:the )?floodwater)\b|सड़क खुली है|मार्ग सुरक्षित|बाढ़ से सुरक्षित|जलभराव नहीं|ರಸ್ತೆ ತೆರೆದಿದೆ|ಮಾರ್ಗ ಸುರಕ್ಷಿತ|ಪ್ರವಾಹದಿಂದ ಸುರಕ್ಷಿತ|ಜಲಾವೃತವಾಗಿಲ್ಲ/iu;

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
      if (!hasWeather) {
        reasons.push(`weather_basis_without_weather_source:${a.title}`);
      }
    }
    if (a.basis === 'route') {
      const hasRoute = a.sourceIds.some((id) => byId.get(id)?.kind === 'route');
      if (!hasRoute) {
        reasons.push(`route_basis_without_route_source:${a.title}`);
      }
    }
    if (a.basis === 'official_guidance') {
      const hasGuidance = a.sourceIds.some(
        (id) => byId.get(id)?.kind === 'official_guidance'
      );
      if (!hasGuidance) {
        reasons.push(`official_guidance_basis_without_guidance_source:${a.title}`);
      }
    }
  }

  if (!opts.hasDestination && plan.travel !== null) {
    reasons.push('travel_present_without_destination');
  }
  if (opts.hasDestination && plan.travel === null) {
    reasons.push('travel_missing_for_destination');
  }

  if (plan.travel) {
    if (plan.travel.recommendation === 'go') {
      reasons.push('travel_go_not_supported');
    }
    const hasRoute = plan.travel.sourceIds.some(
      (id) => byId.get(id)?.kind === 'route'
    );
    if (!hasRoute) {
      reasons.push('travel_missing_route_source');
    }
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
