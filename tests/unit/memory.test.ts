import { describe, expect, it } from 'vitest';
import {
  INITIAL_FORM,
  parseRememberedPreferences,
  rememberablePreferences,
} from '@/app/form-config';

describe('opt-in device preference memory', () => {
  it('round-trips only allowlisted non-sensitive preferences', () => {
    const stored = JSON.stringify(
      rememberablePreferences({
        ...INITIAL_FORM,
        locality: 'Ludhiana',
        scope: 'family',
        phase: 'during',
        language: 'Hindi',
        transportMode: 'car',
        destination: 'Delhi',
        additionalContext: 'Dialysis on alternate days',
        support: { ...INITIAL_FORM.support, needsEssentialMedicines: true },
      })
    );

    expect(stored).not.toContain('Dialysis');
    expect(stored).not.toContain('Delhi');
    expect(stored).not.toContain('needsEssentialMedicines');
    expect(stored).not.toContain('during');
    expect(parseRememberedPreferences(stored)).toEqual({
      version: 1,
      locality: 'Ludhiana',
      scope: 'family',
      language: 'Hindi',
      transportMode: 'car',
      householdSize: 3,
      communitySize: 20,
    });
  });

  it('rejects corrupt or invalid stored data', () => {
    expect(parseRememberedPreferences('{')).toBeNull();
    expect(
      parseRememberedPreferences(
        JSON.stringify({
          version: 1,
          locality: 'Ludhiana',
          scope: 'administrator',
          language: 'Hindi',
          transportMode: 'car',
          householdSize: 3,
          communitySize: 20,
        })
      )
    ).toBeNull();
  });
});
