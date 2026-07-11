/** Domain contracts for MonsoonSathi. Server owns operational metadata. */

export type Scope = 'individual' | 'family' | 'community';
export type Phase = 'before' | 'during' | 'after';
export type Language = 'English' | 'Hindi' | 'Kannada';
export type TransportMode = 'walk' | 'two_wheeler' | 'car' | 'public_transit' | 'other';

export type AlertState = 'active' | 'none' | 'unavailable' | 'stale';
/** Weather-derived risk from live conditions — not an IMD/NDMA bulletin. */
export type WeatherRisk = 'normal' | 'elevated' | 'severe';
export type ActionPriority = 'critical' | 'high' | 'normal';
export type ActionTimeframe =
  | 'now'
  | 'next_hour'
  | 'today'
  | 'before_travel'
  | 'after_event';
export type ActionBasis =
  | 'official_alert'
  | 'weather'
  | 'route'
  | 'profile'
  | 'official_guidance';
export type ActionState = 'prepare' | 'monitor' | 'act' | 'recover';
export type TravelRecommendation =
  | 'go'
  | 'delay'
  | 'reconsider'
  | 'insufficient_data';

export type EvidenceKind =
  | 'weather'
  | 'official_alert'
  | 'route'
  | 'official_guidance';

export interface Evidence {
  id: string;
  kind: EvidenceKind;
  observedAt?: string;
  expiresAt?: string;
  text: string;
  publisher: string;
}

export interface Profile {
  locality: string;
  scope: Scope;
  phase: Phase;
  language: Language;
  transportMode: TransportMode;
  destination?: string;
  // family / personalization
  householdSize?: number;
  hasChildren?: boolean;
  hasElderly?: boolean;
  hasPregnantMember?: boolean;
  hasDisabilityNeeds?: boolean;
  needsEssentialMedicines?: boolean;
  hasPoweredMedicalDevice?: boolean;
  hasPets?: boolean;
  hasPowerBackup?: boolean;
  homeType?: string;
  // community
  communitySize?: number;
  communityCheckInNeeds?: string;
  sharedResources?: string;
  additionalContext?: string;
}

export interface Action {
  priority: ActionPriority;
  title: string;
  instruction: string;
  reason: string;
  appliesTo: string;
  timeframe: ActionTimeframe;
  basis: ActionBasis;
  sourceIds: string[];
}

export interface TravelAdvisory {
  recommendation: TravelRecommendation;
  reason: string;
  cautions: string[];
  sourceIds: string[];
}

export interface GeneratedPlan {
  actionState: ActionState;
  interpretation: string;
  whyPrioritized: string;
  doNow: Action[];
  doNext: Action[];
  checklist: Action[];
  selectedPhase: Action[];
  supportActions: Action[];
  travel: TravelAdvisory | null;
  otherPhaseSummaries: {
    before: string;
    during: string;
    after: string;
  };
  assumptions: string[];
  limitations: string[];
}

export interface LiveWeatherSnapshot {
  provider: string;
  locationLabel: string;
  latitude: number;
  longitude: number;
  temperatureC: number;
  humidityPct: number;
  precipitationMm: number;
  weatherCode: number;
  weatherDescription: string;
  windSpeedKmh: number;
  observedAt: string;
  forecastSummary: string;
  nextHours: Array<{ time: string; tempC: number; precipMm: number; description: string }>;
  weatherRisk: WeatherRisk;
  weatherRiskSummary: string;
}

export interface PlanResponseSuccess {
  ok: true;
  requestId: string;
  generatedAt: string;
  validUntil: string;
  profile: {
    locality: string;
    scope: Scope;
    phase: Phase;
    language: Language;
    hasDestination: boolean;
  };
  weather: LiveWeatherSnapshot;
  alertState: AlertState;
  alertSummary: string;
  sources: Evidence[];
  plan: GeneratedPlan;
  timings: {
    weatherMs: number;
    geminiMs: number;
    totalMs: number;
    /** Number of real Gemini API calls for this plan (never zero on success). */
    modelCalls: number;
  };
}

export interface PlanResponseError {
  ok: false;
  error: string;
  code?: string;
}

export type PlanResponse = PlanResponseSuccess | PlanResponseError;
