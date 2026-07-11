# Challenge alignment map

Challenge: **Monsoon Preparedness & Citizen Assistance** (PromptWars)

| Challenge phrase | Visible feature | Code | Verification |
|---|---|---|---|
| Individuals | Scope = individual | `app/page.tsx`, `lib/schema.ts` | Form + plan profile.scope |
| Families | Scope = family + household needs | `app/page.tsx` | Family checkboxes change support actions |
| Communities | Scope = community + privacy-safe actions | `app/page.tsx` | Community fields + supportActions |
| Personalized preparedness plan | Gemini structured plan | `lib/gemini.ts`, `app/api/plan/route.ts` | Real Gemini timings > 0 |
| Weather-aware guidance | OpenWeather live weather + AI interpretation | `lib/weather.ts` | Observed timestamp on dashboard |
| Emergency checklists | Dynamic checklist | plan.checklist in UI | Checklist section |
| Travel advisories | Optional destination + travel block | `lib/weather.ts` buildTravelEvidence | Route evidence required; `go` rejected; disclaimer shown |
| Safety recommendations | Do now / do next / NDMA guidance | `lib/ndma-guidance.ts`, plan actions | Source g-ndma-1 |
| Multilingual assistance | English / Hindi / Kannada generation | form language → Gemini | Non-English plan text |
| Real-time alerts | Publisher alert state strip (honest unavailable/none/active) | `lib/weather.ts` alertState | Active only from live OpenWeather publisher data; never inferred from weather risk |
| Before / during / after | Phase select + selectedPhase + summaries | form phase + plan | Phase section on dashboard |

## Anti-disqualification

| Risk | Mitigation |
|---|---|
| Static/hardcoded pages | All plan content from live Gemini |
| Mock weather as live | OpenWeather only; provider labeled |
| Canned AI responses | No demo mode in production path |
| False-positive features | Unfinished features not shipped |
| Auth credentials | No authentication |
