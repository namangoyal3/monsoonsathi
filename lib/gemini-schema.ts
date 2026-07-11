/**
 * Compact Gemini response JSON Schema (hand-written).
 *
 * Intentional design choices for code quality and safety:
 * - Shallow schema only (avoids Gemini state-limit failures from deep Zod exports)
 * - Travel recommendations never include affirmative "go" clearance —
 *   weather/route data cannot prove roads are open or flood-safe
 * - Post-generation Zod in schema.ts remains the trust boundary
 */

export const GEMINI_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    actionState: {
      type: 'string',
      enum: ['prepare', 'monitor', 'act', 'recover'],
    },
    interpretation: { type: 'string' },
    whyPrioritized: { type: 'string' },
    doNow: { type: 'array', items: { $ref: '#/$defs/action' } },
    doNext: { type: 'array', items: { $ref: '#/$defs/action' } },
    checklist: { type: 'array', items: { $ref: '#/$defs/action' } },
    selectedPhase: { type: 'array', items: { $ref: '#/$defs/action' } },
    supportActions: { type: 'array', items: { $ref: '#/$defs/action' } },
    travel: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          properties: {
            recommendation: {
              type: 'string',
              enum: ['delay', 'reconsider', 'insufficient_data'],
            },
            reason: { type: 'string' },
            cautions: { type: 'array', items: { type: 'string' } },
            sourceIds: { type: 'array', items: { type: 'string' } },
          },
          required: ['recommendation', 'reason', 'cautions', 'sourceIds'],
        },
      ],
    },
    otherPhaseSummaries: {
      type: 'object',
      properties: {
        before: { type: 'string' },
        during: { type: 'string' },
        after: { type: 'string' },
      },
      required: ['before', 'during', 'after'],
    },
    assumptions: { type: 'array', items: { type: 'string' } },
    limitations: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'actionState',
    'interpretation',
    'whyPrioritized',
    'doNow',
    'doNext',
    'checklist',
    'selectedPhase',
    'supportActions',
    'travel',
    'otherPhaseSummaries',
    'assumptions',
    'limitations',
  ],
  $defs: {
    action: {
      type: 'object',
      properties: {
        priority: { type: 'string', enum: ['critical', 'high', 'normal'] },
        title: { type: 'string' },
        instruction: { type: 'string' },
        reason: { type: 'string' },
        appliesTo: { type: 'string' },
        timeframe: {
          type: 'string',
          enum: ['now', 'next_hour', 'today', 'before_travel', 'after_event'],
        },
        basis: {
          type: 'string',
          enum: [
            'official_alert',
            'weather',
            'route',
            'profile',
            'official_guidance',
          ],
        },
        sourceIds: { type: 'array', items: { type: 'string' } },
      },
      required: [
        'priority',
        'title',
        'instruction',
        'reason',
        'appliesTo',
        'timeframe',
        'basis',
        'sourceIds',
      ],
    },
  },
} as const;
