import type { Language, Phase, Scope, TransportMode } from '@/types/contract';

/** Shared form constants — keeps page.tsx focused on interaction state. */

export const PHASES: Array<{ value: Phase; label: string; hint: string }> = [
  { value: 'before', label: 'Prepare', hint: 'Before heavy rain' },
  { value: 'during', label: 'Respond', hint: 'While it is happening' },
  { value: 'after', label: 'Recover', hint: 'Once conditions ease' },
];

export const SUPPORT_NEEDS = [
  ['hasChildren', 'Children'],
  ['hasElderly', 'Elderly member'],
  ['hasPregnantMember', 'Pregnancy support'],
  ['hasDisabilityNeeds', 'Disability support'],
  ['needsEssentialMedicines', 'Essential medicines'],
  ['hasPoweredMedicalDevice', 'Powered medical device'],
  ['hasPets', 'Pets'],
] as const;

export type SupportKey = (typeof SUPPORT_NEEDS)[number][0];

export interface FormState {
  locality: string;
  scope: Scope;
  phase: Phase;
  language: Language;
  transportMode: TransportMode;
  destination: string;
  householdSize: number;
  communitySize: number;
  additionalContext: string;
  support: Record<SupportKey, boolean>;
}

export function emptySupport(): Record<SupportKey, boolean> {
  return Object.fromEntries(
    SUPPORT_NEEDS.map(([key]) => [key, false])
  ) as Record<SupportKey, boolean>;
}

export const INITIAL_FORM: FormState = {
  locality: 'Bengaluru',
  scope: 'individual',
  phase: 'before',
  language: 'English',
  transportMode: 'public_transit',
  destination: '',
  householdSize: 3,
  communitySize: 20,
  additionalContext: '',
  support: emptySupport(),
};

/** Demo chips only prefill form fields — submit still hits live APIs. */
export const DEMO_SCENARIOS: Array<{
  id: string;
  label: string;
  hint: string;
  form: FormState;
}> = [
  {
    id: 'family-during',
    label: 'Family · During · EN',
    hint: 'Elderly + powered device',
    form: {
      ...INITIAL_FORM,
      scope: 'family',
      phase: 'during',
      language: 'English',
      transportMode: 'two_wheeler',
      householdSize: 4,
      support: {
        ...emptySupport(),
        hasElderly: true,
        hasPoweredMedicalDevice: true,
        needsEssentialMedicines: true,
      },
    },
  },
  {
    id: 'community-kn',
    label: 'Community · After · KN',
    hint: 'Privacy-safe check-ins',
    form: {
      ...INITIAL_FORM,
      scope: 'community',
      phase: 'after',
      language: 'Kannada',
      communitySize: 80,
      additionalContext:
        'Elderly residents and powered-equipment users need check-ins',
      support: emptySupport(),
    },
  },
  {
    id: 'individual-hi',
    label: 'Individual · Before · HI',
    hint: 'Hindi prep plan',
    form: {
      ...INITIAL_FORM,
      scope: 'individual',
      phase: 'before',
      language: 'Hindi',
      support: emptySupport(),
    },
  },
  {
    id: 'travel',
    label: 'Travel stress · EN',
    hint: 'Electronic City commute',
    form: {
      ...INITIAL_FORM,
      scope: 'individual',
      phase: 'during',
      language: 'English',
      transportMode: 'two_wheeler',
      destination: 'Electronic City',
      support: emptySupport(),
    },
  },
];
