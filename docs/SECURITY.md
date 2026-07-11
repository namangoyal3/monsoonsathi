# Security

## Threat model (competition MVP)

| Threat | Control |
|---|---|
| Prompt injection via profile/context | Profile delimited as untrusted; system rules forbid following it |
| Invented emergency numbers / sources | Semantic validation rejects phones, unknown source IDs, and evidence-kind mismatches |
| Unsupported road clearance / “flood-safe road” claims | Multilingual phrase scan, travel `go` rejection, required route evidence, deterministic UI disclaimer |
| Secret leakage | Server-only `GEMINI_API_KEY` / `OPENWEATHER_API_KEY`; no `NEXT_PUBLIC_*` keys |
| Abuse / cost | Rate limit 30 plan POSTs / min / IP (per instance) + 32 KB streamed-body cap + shared request deadline |
| XSS via model HTML | React text rendering only; HTML/URL scan rejects model HTML |
| Over-collection | No auth or DB; opt-in localStorage allowlists only basic preferences and excludes destination, support needs, personal notes, and plans |

Authentication is intentionally absent, so evaluator credentials are not required. No feature is hidden behind a login.

## Device memory

Basic preferences can be remembered only after explicit opt-in. The browser stores coarse locality, plan audience, language, travel mode, and group size in `localStorage`; the application validates this untrusted data before restoring it. Unchecking the option deletes it. Medical/support selections, destination, free-text context, and generated plans are never included. Device memory is browser-local, not cross-device, and clearing site data removes it.

## Headers

Configured in `next.config.ts`: CSP, nosniff, frame deny, referrer policy, permissions policy, HSTS.

## Rate limiting

`lib/rateLimit.ts` + `POST /api/plan`. The route explicitly allows 30 requests per minute per IP and returns `429` with `Retry-After`. This in-memory limiter is not globally authoritative across serverless instances; platform limits remain the outer control.

## Logging

Only request IDs, safe error codes, and timings. No full profiles, coordinates dumps, prompts, or keys.
