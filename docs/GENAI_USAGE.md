# GenAI usage — GenAI-first architecture

## Principle

> **Gemini creates every adaptive recommendation. Application code only verifies live facts, schema, sources, and safety.**

There is **no demo mode**, **no canned plan**, and **no hardcoded checklist / do-now / travel explanation** served to users.

| Concern | Owner |
|---|---|
| Live weather & geocoding | Deterministic OpenWeather APIs |
| NDMA guidance bullets as evidence IDs | Versioned static **input** to the model (not the plan itself) |
| Personalized plan, checklist, travel, multilingual text, family/community actions, phase guidance | **Gemini only** |
| Schema, matching evidence kind, phone/HTML/flood-safe/affirmative-travel rejection | Deterministic validators |
| Rate limit, secrets, headers | Deterministic security |

## Request flow

```text
User profile (untrusted)
        │
        ▼
Zod validate ──► live geocode ──► live weather (+ optional route context)
        │
        ▼
Verified evidence packet (source IDs)
        │
        ▼
Live Gemini structured JSON call
        │
        ▼
coerce enums only → Zod schema → completeness checks → safety scan
        │ invalid/unsafe
        └──────────────► one live Gemini repair attempt → validate again
        │
        ▼
Dashboard (labels: Live weather fact vs AI-generated guidance)
```

On incomplete/invalid model output the API makes at most one plan-repair attempt with Gemini, then returns an **honest error**. It never substitutes a hardcoded plan. A schema-mode empty response may also be retried without response-schema enforcement; every provider request is counted in `modelCalls`.

## What Gemini generates (every successful plan)

1. `interpretation` / `whyPrioritized` — weather-aware, profile-specific
2. `doNow` / `doNext` — personalized immediate and next actions
3. `checklist` — adaptive emergency checklist
4. `selectedPhase` — actions for before / during / after as selected
5. `otherPhaseSummaries` — all three phases
6. `supportActions` — required when family/community/vulnerable flags set
7. `travel` — required when destination provided (never flood-safe claims)
8. `assumptions` / `limitations`
9. Full output in English, Hindi, or Kannada as requested

## Model configuration

- Model: configurable via `GEMINI_MODEL` (default `gemini-flash-lite-latest`)
- `responseMimeType: application/json`
- Compact hand-written `responseJsonSchema`
- Temperature `0.3`
- Post-validation: Zod + `assertGenAiCompleteness` + matching evidence-kind, official-alert, and prohibited-claim checks

## Proof on each response

Successful API responses include:

```json
"timings": {
  "weatherMs": 62,
  "geminiMs": 3410,
  "totalMs": 3587,
  "modelCalls": 1
}
```

`modelCalls >= 1` is required for success — a path that never called Gemini cannot return `ok: true`. The count can exceed one only for a live provider/schema retry or one live plan-repair attempt.

## Demo chips

UI “Quick demos” only **pre-fill form fields**. Submitting always hits live weather + live Gemini.
