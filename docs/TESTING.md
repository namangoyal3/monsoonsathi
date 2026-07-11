# Testing

## Commands

```bash
npm run selfcheck   # deterministic guard script
npm test            # vitest unit suite
npm run test:e2e    # playwright form/a11y smoke (starts local server)
npm run typecheck
npm run build
npm run verify
npm run verify:live # deterministic checks, production build, then live E2E
```

## What is covered

| Layer | Cases |
|---|---|
| Unit/API | Profile validation, enum coercion, unsafe route/travel rejection, phone rejection, unknown/mismatched evidence rejection, alert grounding, weather codes, cache/rate-limit bounds, body-size and invalid-JSON handling |
| E2E | Home labels + axe, demo chips fill form only, prompt-injection error surface (no leakage), keyboard-only operability, mobile viewport, and four live plan paths |
| Manual/live | English/Hindi/Kannada generation, individual/family/community scopes, travel evidence and disclaimer |

## Latest local results

Run on the final build (live APIs, no mocks):

- `npm test` (vitest): **19/19 passed** across `tests/unit/guards.test.ts` and `tests/unit/route.test.ts`
- `npm run test:e2e` (playwright): **11/11 passed** across 6 spec files, including four real OpenWeather + Gemini submissions, in ~32.4s

Notes:

- Playwright runs with `workers: 1` and uses `tests/e2e/throttle.ts` to pace live Gemini/OpenWeather submissions across consecutive runs.
- `lib/gemini.ts` performs one bounded retry on transient upstream failures (429/5xx/network); if the retry also fails, the honest error panel is shown — no mock plan.
- The injection spec surfaced a real reflected-input issue: `lib/geocode.ts` echoed the raw unresolved locality into the error panel. Fixed by replacing it with a generic message that never echoes user input.

Production smoke results belong in the deployment handoff only after they are rerun against the deployed build.

Do not invent pass results—re-run commands after code changes.
