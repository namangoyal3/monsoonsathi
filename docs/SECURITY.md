# Security

## Threat model (competition MVP)

| Threat | Control |
|---|---|
| Prompt injection via profile/context | Profile delimited as untrusted; system rules forbid following it |
| Invented emergency numbers / sources | Semantic validation rejects phones, unknown source IDs |
| Unsupported “flood-safe road” claims | Phrase + travel validation; deterministic UI disclaimer |
| Secret leakage | Server-only `GEMINI_API_KEY` / `OPENWEATHER_API_KEY`; no `NEXT_PUBLIC_*` keys |
| Abuse / cost | Rate limit 8 plan POSTs / min / IP (per instance) + payload size cap |
| XSS via model HTML | React text rendering only; HTML/URL scan rejects model HTML |
| Over-collection | No auth, no DB, no sensitive localStorage |

## Headers

Configured in `next.config.ts`: CSP, nosniff, frame deny, referrer policy, permissions policy, HSTS.

## Rate limiting

`lib/rateLimit.ts` + `POST /api/plan`. Returns `429` with `Retry-After`. Not a global multi-region limiter; sufficient as a secondary guard for the demo.

## Logging

Only request IDs, safe error codes, and timings. No full profiles, coordinates dumps, prompts, or keys.
