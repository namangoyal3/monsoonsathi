# Platform logic map — every feature

| User-facing feature | Live data / GenAI | Deterministic guardrails |
|---|---|---|
| Locality resolution | OpenWeather Geocoding API | Zod bounds; no guessed coordinates |
| Current weather & forecast | OpenWeather current + forecast | Cache 4m public only; fail closed if missing |
| Official alert state | Honest `unavailable` without inventing alerts | Never fabricate active alerts |
| Personalized plan | **Gemini** | Completeness + Zod |
| Emergency checklist | **Gemini** | Min 4 model items; no static checklist |
| Do now / Do next | **Gemini** | Safety scan; source IDs |
| Family / community actions | **Gemini** from profile flags | Privacy-safe labels; no identity storage |
| Before / during / after | **Gemini** `selectedPhase` + summaries | Phase enum only |
| Multilingual EN/HI/KN | **Gemini** generates in chosen language | No translation table |
| Travel advisory | **Gemini** + optional distance evidence | Flood-safe claims rejected |
| Safety recommendations | **Gemini** prioritized by profile + weather | Prompt injection isolated |
| Sources panel | Server evidence IDs | Model may only cite those IDs |
| Demo chips | Form prefill only | Still requires live Gemini on submit |
| Rate limiting / headers | App code | Not user-facing plan content |

## Hardcoding policy

**Allowed (infrastructure):** schemas, validators, timeouts, rate limits, UI chrome labels, NDMA bullet evidence as **model input**.

**Forbidden:** canned plan text, static checklists, fake weather, precomputed multilingual plans, silent demo mode.
