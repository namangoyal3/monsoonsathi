import type { Action, Evidence, EvidenceKind, GeneratedPlan } from '@/types/contract';

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
 * Every failure rejects the plan. Model output is never patched with evidence it did
 * not cite because that would turn an unsupported answer into a false positive.
 */
export function validatePlanSemantics(
  plan: GeneratedPlan,
  evidence: Evidence[],
  opts: { hasDestination: boolean; alertState: string }
): ValidationResult {
  const reasons: string[] = [];
  const allowed = new Set(evidence.map((e) => e.id));
  const byId = new Map(evidence.map((item) => [item.id, item]));

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

  const actions: Action[] = [
    ...plan.doNow,
    ...plan.doNext,
    ...plan.checklist,
    ...plan.selectedPhase,
    ...plan.supportActions,
  ];
  const expectedKind: Partial<Record<Action['basis'], EvidenceKind>> = {
    official_alert: 'official_alert',
    weather: 'weather',
    route: 'route',
    official_guidance: 'official_guidance',
  };

  for (const action of actions) {
    const kind = expectedKind[action.basis];
    if (
      kind &&
      !action.sourceIds.some((id) => byId.get(id)?.kind === kind)
    ) {
      reasons.push(`basis_without_matching_evidence:${action.basis}:${action.title}`);
    }
    if (action.basis === 'official_alert' && opts.alertState !== 'active') {
      reasons.push(`official_alert_basis_without_active_alert:${action.title}`);
    }
  }

  if (!opts.hasDestination && plan.travel !== null) {
    reasons.push('travel_present_without_destination');
  }
  if (opts.hasDestination && plan.travel === null) {
    reasons.push('travel_missing_for_destination');
  }

  if (plan.travel) {
    // Affirmative "go" is excluded at schema/coerce layer; keep phrase safety checks.
    if (!plan.travel.sourceIds.some((id) => byId.get(id)?.kind === 'route')) {
      reasons.push('travel_without_route_evidence');
    }
    if (ROUTE_SAFETY_RE.test(plan.travel.reason)) {
      reasons.push('travel_reason_route_safety_claim');
    }
    for (const c of plan.travel.cautions) {
      if (ROUTE_SAFETY_RE.test(c)) reasons.push('travel_caution_route_safety_claim');
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
  };
}
