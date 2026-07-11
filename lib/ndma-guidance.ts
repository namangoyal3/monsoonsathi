import type { Evidence } from '@/types/contract';

/**
 * Short, versioned NDMA monsoon safety guidance snapshot.
 * Used as official_guidance evidence for Gemini — not a live feed.
 * Source: https://sachet.ndma.gov.in/DosDont (public preparedness guidance)
 */
export const NDMA_GUIDANCE_VERSION = 'ndma-monsoon-dosdonts-2024-snapshot';

const GUIDANCE_LINES = [
  'Do not enter or drive through floodwater; depth and current are hard to judge.',
  'Keep essential medicines, documents, torch, and drinking water ready in a go-bag.',
  'Unplug electrical appliances during heavy rain or water ingress risk; avoid wet switches.',
  'Stay away from fallen power lines and weak structures after storms.',
  'Follow official evacuation or restriction instructions from local authorities when issued.',
  'Check on elderly people, children, and people who rely on powered medical devices.',
  'Boil or purify drinking water if supply is disrupted after flooding.',
  'Do not spread unverified rumours; rely on official weather and disaster updates.',
];

export function getNdmaGuidanceEvidence(): Evidence {
  return {
    id: 'g-ndma-1',
    kind: 'official_guidance',
    observedAt: '2024-01-01T00:00:00.000Z',
    text: GUIDANCE_LINES.join(' '),
    publisher: `NDMA Do's and Don'ts (${NDMA_GUIDANCE_VERSION})`,
  };
}

export function getNdmaGuidanceLines(): string[] {
  return [...GUIDANCE_LINES];
}
