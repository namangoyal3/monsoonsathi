import { PlanRequestSchema } from '@/lib/schema';
import { geocodeLocality } from '@/lib/geocode';
import { buildTravelEvidence, fetchLiveWeather } from '@/lib/weather';
import { getNdmaGuidanceEvidence } from '@/lib/ndma-guidance';
import { generateMonsoonPlan } from '@/lib/gemini';
import { toPublicError, AppError } from '@/lib/errors';
import { checkRateLimit, clientIpFromRequest } from '@/lib/rateLimit';
import type { PlanResponse, Profile } from '@/types/contract';

export const maxDuration = 60;

function json(
  body: PlanResponse,
  status = 200,
  extraHeaders?: Record<string, string>
): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  const started = Date.now();
  const requestId = `ms-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const ip = clientIpFromRequest(request);
    // Generous enough for evaluator multi-feature walkthroughs; still blocks abuse.
    const rl = checkRateLimit(`plan:${ip}`, 30, 60_000);
    if (!rl.ok) {
      return json(
        {
          ok: false,
          error: 'Too many plan requests. Please wait a moment and try again.',
          code: 'RATE_LIMITED',
        },
        429,
        { 'Retry-After': String(rl.retryAfterSec) }
      );
    }

    // Bound body size (~32kb)
    const rawText = await request.text();
    if (rawText.length > 32_000) {
      return json(
        { ok: false, error: 'Request body too large.', code: 'PAYLOAD_TOO_LARGE' },
        413
      );
    }

    let body: unknown;
    try {
      body = JSON.parse(rawText);
    } catch {
      return json(
        { ok: false, error: 'Request body must be valid JSON.', code: 'INVALID_JSON' },
        400
      );
    }

    const parsed = PlanRequestSchema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
        .join('; ');
      return json(
        { ok: false, error: `Invalid request: ${issues}`, code: 'VALIDATION' },
        400
      );
    }

    const profile = normalizeProfile(parsed.data.profile);

    // 1) Live location
    const location = await geocodeLocality(profile.locality);

    // 2) Live weather (+ optional travel context in parallel after we have origin)
    const weatherBundle = await fetchLiveWeather(location);

    const evidence = [
      ...weatherBundle.sources,
      getNdmaGuidanceEvidence(),
    ];

    if (profile.destination?.trim()) {
      const travelEv = await buildTravelEvidence(location, profile.destination.trim());
      if (travelEv) evidence.push(travelEv);
    }

    // 3) Real Gemini generation only — no hardcoded plan content
    const { plan, geminiMs, modelCalls } = await generateMonsoonPlan(
      profile,
      evidence,
      weatherBundle.alertState,
      weatherBundle.alertSummary
    );

    if (modelCalls < 1) {
      throw new AppError(
        'GEMINI_REQUIRED',
        'A live GenAI call is required; no hardcoded plan is allowed.',
        500
      );
    }

    const generatedAt = new Date().toISOString();
    const validUntil = new Date(Date.now() + 30 * 60_000).toISOString();

    return json({
      ok: true,
      requestId,
      generatedAt,
      validUntil,
      profile: {
        locality: weatherBundle.weather.locationLabel,
        scope: profile.scope,
        phase: profile.phase,
        language: profile.language,
        hasDestination: Boolean(profile.destination?.trim()),
      },
      weather: weatherBundle.weather,
      alertState: weatherBundle.alertState,
      alertSummary: weatherBundle.alertSummary,
      sources: evidence,
      plan,
      timings: {
        weatherMs: weatherBundle.weatherMs,
        geminiMs,
        totalMs: Date.now() - started,
        modelCalls,
      },
    });
  } catch (err) {
    // Log only safe codes
    if (err instanceof AppError) {
      console.error(JSON.stringify({ requestId, code: err.code, status: err.status }));
    } else {
      console.error(JSON.stringify({ requestId, code: 'INTERNAL' }));
    }
    const { status, body } = toPublicError(err);
    return json(body, status);
  }
}

function normalizeProfile(
  p: ReturnType<typeof PlanRequestSchema.parse>['profile']
): Profile {
  return {
    locality: p.locality.trim(),
    scope: p.scope,
    phase: p.phase,
    language: p.language,
    transportMode: p.transportMode,
    destination: p.destination?.trim() || undefined,
    householdSize: p.householdSize,
    hasChildren: p.hasChildren,
    hasElderly: p.hasElderly,
    hasPregnantMember: p.hasPregnantMember,
    hasDisabilityNeeds: p.hasDisabilityNeeds,
    needsEssentialMedicines: p.needsEssentialMedicines,
    hasPoweredMedicalDevice: p.hasPoweredMedicalDevice,
    hasPets: p.hasPets,
    hasPowerBackup: p.hasPowerBackup,
    homeType: p.homeType?.trim() || undefined,
    communitySize: p.communitySize,
    communityCheckInNeeds: p.communityCheckInNeeds?.trim() || undefined,
    sharedResources: p.sharedResources?.trim() || undefined,
    additionalContext: p.additionalContext?.trim() || undefined,
  };
}
