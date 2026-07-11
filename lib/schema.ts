import { z } from 'zod';

const nonempty = (max: number) => z.string().trim().min(1).max(max);

export const ProfileSchema = z
  .object({
    locality: nonempty(120),
    scope: z.enum(['individual', 'family', 'community']),
    phase: z.enum(['before', 'during', 'after']),
    language: z.enum(['English', 'Hindi', 'Kannada']),
    transportMode: z.enum(['walk', 'two_wheeler', 'car', 'public_transit', 'other']),
    destination: z.string().trim().max(120).optional().or(z.literal('')),
    householdSize: z.number().int().min(1).max(30).optional(),
    hasChildren: z.boolean().optional(),
    hasElderly: z.boolean().optional(),
    hasPregnantMember: z.boolean().optional(),
    hasDisabilityNeeds: z.boolean().optional(),
    needsEssentialMedicines: z.boolean().optional(),
    hasPoweredMedicalDevice: z.boolean().optional(),
    hasPets: z.boolean().optional(),
    hasPowerBackup: z.boolean().optional(),
    homeType: z.string().trim().max(80).optional().or(z.literal('')),
    communitySize: z.number().int().min(2).max(5000).optional(),
    communityCheckInNeeds: z.string().trim().max(300).optional().or(z.literal('')),
    sharedResources: z.string().trim().max(300).optional().or(z.literal('')),
    additionalContext: z.string().trim().max(300).optional().or(z.literal('')),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.scope === 'community' && !data.communitySize) {
      ctx.addIssue({
        code: 'custom',
        path: ['communitySize'],
        message: 'Community size is required for community scope.',
      });
    }
  });

export const PlanRequestSchema = z
  .object({
    profile: ProfileSchema,
  })
  .strict();

export const ActionSchema = z
  .object({
    priority: z.enum(['critical', 'high', 'normal']),
    title: z.string().min(1).max(100),
    instruction: z.string().min(1).max(350),
    reason: z.string().min(1).max(300),
    appliesTo: z.string().min(1).max(80),
    timeframe: z.enum(['now', 'next_hour', 'today', 'before_travel', 'after_event']),
    basis: z.enum([
      'official_alert',
      'weather',
      'route',
      'profile',
      'official_guidance',
    ]),
    sourceIds: z.array(z.string().min(1).max(40)).max(8),
  })
  .strict();

export const GeneratedPlanSchema = z
  .object({
    actionState: z.enum(['prepare', 'monitor', 'act', 'recover']),
    interpretation: z.string().min(1).max(800),
    whyPrioritized: z.string().min(1).max(500),
    doNow: z.array(ActionSchema).min(1).max(3),
    doNext: z.array(ActionSchema).min(1).max(4),
    checklist: z.array(ActionSchema).min(4).max(6),
    selectedPhase: z.array(ActionSchema).min(1).max(3),
    supportActions: z.array(ActionSchema).max(4),
    travel: z
      .object({
        recommendation: z.enum(['go', 'delay', 'reconsider', 'insufficient_data']),
        reason: z.string().min(1).max(400),
        cautions: z.array(z.string().min(1).max(200)).max(3),
        sourceIds: z.array(z.string().min(1).max(40)).max(8),
      })
      .strict()
      .nullable(),
    otherPhaseSummaries: z
      .object({
        before: z.string().min(1).max(300),
        during: z.string().min(1).max(300),
        after: z.string().min(1).max(300),
      })
      .strict(),
    assumptions: z.array(z.string().min(1).max(200)).max(3),
    limitations: z.array(z.string().min(1).max(200)).min(1).max(3),
  })
  .strict();

export type ProfileInput = z.infer<typeof ProfileSchema>;
