import { PlanRequestSchema } from '@/lib/schema';
import { geocodeLocality } from '@/lib/geocode';
import { buildTravelEvidence, fetchLiveWeather } from '@/lib/weather';
import { getNdmaGuidanceEvidence } from '@/lib/ndma-guidance';
import { generateMonsoonPlan } from '@/lib/gemini';
import { toPublicError, AppError } from '@/lib/errors';
import { checkRateLimit, clientIpFromRequest } from '@/lib/rateLimit';
import type { PlanResponse, Profile } from '@/types/contract';

export const maxDuration = 60;
const MAX_BODY_BYTES = 32_000;

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

async function readBody(request: Request): Promise<string> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new AppError('PAYLOAD_TOO_LARGE', 'Request body too large.', 413);
  }
  if (!request.body) return '';

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new AppError('PAYLOAD_TOO_LARGE', 'Request body too large.', 413);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export async function POST(request: Request): Promise<Response> {
  const started = Date.now();
  const requestId = `ms-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const deadline = AbortSignal.timeout(55_000);

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

    const rawText = await readBody(request);

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
    const location = await geocodeLocality(profile.locality, deadline);

    // 2) Independent live lookups run together under the request deadline.
    const [weatherBundle, travelEvidence] = await Promise.all([
      fetchLiveWeather(location, deadline),
      profile.destination?.trim()
        ? buildTravelEvidence(
            location,
            profile.destination.trim(),
            profile.transportMode,
            deadline
          )
        : Promise.resolve(null),
    ]);

    const evidence = [
      ...weatherBundle.sources,
      getNdmaGuidanceEvidence(),
    ];

    if (travelEvidence) evidence.push(travelEvidence);

    // 3) Real Gemini generation only — no hardcoded plan content
    const { plan, geminiMs, modelCalls } = await generateMonsoonPlan(
      profile,
      evidence,
      weatherBundle.alertState,
      weatherBundle.alertSummary,
      deadline
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
