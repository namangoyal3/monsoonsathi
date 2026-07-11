# Code map (Code Quality reference)

Single vertical flow — no multi-agent runtime, no database, no auth.

```
app/page.tsx              Form interaction only
app/form-config.ts        Demo scenarios + form constants
app/plan-view.tsx         Result rendering only
app/api/plan/route.ts     Orchestration boundary (rate limit, body cap, errors)

lib/schema.ts             Zod request + plan schemas (trust boundary)
lib/geocode.ts            OpenWeather geocoding adapter
lib/weather.ts            Live weather + risk + optional alerts + OSRM travel evidence
lib/ndma-guidance.ts      Versioned official guidance evidence (input to model)
lib/prompt.ts             System / user / repair prompts
lib/gemini-schema.ts      Compact Gemini JSON Schema
lib/gemini-client.ts      HTTP client + bounded retries
lib/coerce-plan.ts        Enum coercion + parse (no invented content)
lib/gemini.ts             generateMonsoonPlan orchestration
lib/validate-plan.ts      Semantic safety (phones, flood-safe, evidence kinds)
lib/rateLimit.ts          Per-instance IP limiter
lib/env.ts                Server-only secrets
lib/errors.ts             Typed public errors
lib/cache.ts              Short public weather cache

types/contract.ts         Domain types (single source of truth)
```

## Design rules

1. **UI never calls providers or builds prompts.**
2. **Gemini never owns validation** — Zod + validate-plan do.
3. **No canned plan path** — incomplete GenAI fails or repairs once.
4. **Travel never claims roads are open/flood-safe** — enum excludes affirmative `go`.
