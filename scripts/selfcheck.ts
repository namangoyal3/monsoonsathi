import assert from 'node:assert/strict';

import { ProfileSchema } from '../lib/schema';
import { validatePlanSemantics } from '../lib/validate-plan';
import type { Action, Evidence, GeneratedPlan } from '../types/contract';

const validProfile = {
  locality: 'Bengaluru',
  scope: 'individual',
  phase: 'before',
  language: 'English',
  transportMode: 'walk',
} as const;

assert(ProfileSchema.safeParse(validProfile).success, 'valid profile should pass');
assert(
  !ProfileSchema.safeParse({ ...validProfile, locality: 'x'.repeat(121) }).success,
  'locality over 120 characters should fail'
);
assert(
  !ProfileSchema.safeParse({ ...validProfile, householdSize: 31 }).success,
  'household size over 30 should fail'
);
assert(
  !ProfileSchema.safeParse({ ...validProfile, unexpected: true }).success,
  'unknown profile fields should fail'
);

const action: Action = {
  priority: 'high',
  title: 'Check the forecast',
  instruction: 'Review live rainfall conditions before leaving.',
  reason: 'Conditions may change quickly.',
  appliesTo: 'You',
  timeframe: 'now',
  basis: 'weather',
  sourceIds: ['weather-1'],
};

const basePlan: GeneratedPlan = {
  actionState: 'prepare',
  interpretation: 'Rain is possible, so prepare before travel.',
  whyPrioritized: 'Live weather supports preparation.',
  doNow: [action],
  doNext: [action],
  checklist: [action, action, action, action],
  selectedPhase: [action],
  supportActions: [],
  travel: null,
  otherPhaseSummaries: {
    before: 'Prepare essentials.',
    during: 'Monitor conditions.',
    after: 'Check for damage.',
  },
  assumptions: [],
  limitations: ['Official alerts are unavailable.'],
};

const evidence: Evidence[] = [
  {
    id: 'weather-1',
    kind: 'weather',
    text: 'Live rain forecast.',
    publisher: 'Test weather provider',
  },
];

function expectRejection(plan: GeneratedPlan, reason: string): void {
  const result = validatePlanSemantics(plan, evidence, {
    hasDestination: false,
    alertState: 'unavailable',
  });
  assert(!result.ok, `plan should be rejected for ${reason}`);
  assert(
    result.reasons.some((item) => item.includes(reason)),
    `expected rejection reason containing ${reason}; received ${result.reasons.join(', ')}`
  );
}

expectRejection(
  { ...basePlan, doNow: [{ ...action, sourceIds: ['unknown-source'] }] },
  'unknown_source_id'
);
expectRejection({ ...basePlan, interpretation: '<b>Unsafe output</b>' }, 'html_or_url');
expectRejection(
  { ...basePlan, interpretation: 'Visit https://example.com for updates.' },
  'html_or_url'
);
expectRejection(
  { ...basePlan, interpretation: 'Call 98765 43210 for assistance.' },
  'invented_or_included_phone_number'
);
expectRejection(
  { ...basePlan, interpretation: 'The road is open, so leave now.' },
  'unsupported_route_safety_claim'
);

console.log('MonsoonSathi self-check passed.');
