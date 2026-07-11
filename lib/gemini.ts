import { AppError } from '@/lib/errors';
import { parsePlan } from '@/lib/coerce-plan';
import { geminiComplete } from '@/lib/gemini-client';
import {
  buildRepairPrompt,
  buildSystemPrompt,
  buildUserPrompt,
} from '@/lib/prompt';
import { validatePlanSemantics } from '@/lib/validate-plan';
import type { Evidence, GeneratedPlan, Profile } from '@/types/contract';

// Re-export pure helpers so existing tests keep importing from @/lib/gemini
export { coercePlanShape, extractJson, parsePlan } from '@/lib/coerce-plan';

/**
 * Completeness checks — fail closed; never inject hardcoded actions.
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

export interface GeneratePlanResult {
  plan: GeneratedPlan;
  geminiMs: number;
  modelCalls: number;
}

/**
 * Orchestrates live Gemini generation + validation.
 * Single responsibility: one plan attempt, one optional repair attempt.
 */
export async function generateMonsoonPlan(
  profile: Profile,
  evidence: Evidence[],
  alertState: string,
  alertSummary: string,
  signal: AbortSignal = AbortSignal.timeout(55_000)
): Promise<GeneratePlanResult> {
  const t0 = Date.now();
  const system = buildSystemPrompt();
  let modelCalls = 0;

  const runOnce = async (user: string): Promise<GeneratedPlan> => {
    const raw = await geminiComplete(system, user, signal, () => {
      modelCalls += 1;
    });
    let plan = parsePlan(raw);

    if (!profile.destination?.trim()) {
      plan = { ...plan, travel: null };
    }

    assertGenAiCompleteness(plan, profile);

    const semantic = validatePlanSemantics(plan, evidence, {
      hasDestination: Boolean(profile.destination?.trim()),
      alertState,
    });

    if (!semantic.ok) {
      throw new AppError(
        'GEMINI_UNSAFE',
        `Personalized guidance failed safety validation (${semantic.reasons[0]}).`,
        502
      );
    }
    return plan;
  };

  try {
    const plan = await runOnce(
      buildUserPrompt(profile, evidence, alertState, alertSummary)
    );
    return { plan, geminiMs: Date.now() - t0, modelCalls };
  } catch (first) {
    const repairable = new Set([
      'GEMINI_INVALID_JSON',
      'GEMINI_SCHEMA',
      'GEMINI_INCOMPLETE',
      'GEMINI_UNSAFE',
      'GEMINI_EMPTY',
    ]);
    if (
      signal.aborted ||
      !(first instanceof AppError) ||
      !repairable.has(first.code)
    ) {
      throw first;
    }

    console.error(JSON.stringify({ code: 'GEMINI_REPAIR', reason: first.code }));

    try {
      const plan = await runOnce(
        buildRepairPrompt(
          profile,
          evidence,
          alertState,
          alertSummary,
          first.code,
          ''
        )
      );
      return { plan, geminiMs: Date.now() - t0, modelCalls };
    } catch (second) {
      if (second instanceof AppError) throw second;
      throw new AppError(
        'GEMINI_UNAVAILABLE',
        'Live GenAI could not produce a complete validated plan. No hardcoded plan is returned.',
        502
      );
    }
  }
}
