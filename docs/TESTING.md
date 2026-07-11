# Testing

## Commands

```bash
npm run selfcheck   # deterministic guard script
npm test            # vitest unit suite
npm run test:e2e    # playwright form/a11y smoke (starts local server)
npm run typecheck
npm run build
npm run verify
```

## What is covered

| Layer | Cases |
|---|---|
| Unit | Profile validation, enum coercion, flood-safe reject, phone reject, source sanitize, weather codes, rate limit |
| E2E | Home labels + axe, demo chips fill form only, prompt-injection error surface (no leakage), keyboard-only operability, mobile viewport (no horizontal scroll), a11y, live plan smoke |
| Manual/live | Live plan, non-English output, community support, travel disclaimer |

## Latest local results

Run on the final build (live APIs, no mocks):

- `npm test` (vitest): **12/12 passed** — 1 file, `tests/unit/guards.test.ts`, ~150ms
- `npm run test:e2e` (playwright): **8/8 passed** across 7 specs (`a11y`, `home` ×3, `injection`, `keyboard`, `mobile`, `smoke`), ~9s

Notes:

- Playwright runs with `workers: 1` (set in `playwright.config.ts`): parallel submits fire concurrent live Gemini/OpenWeather calls, which can trip free-tier quotas and flake the live-path tests.
- The injection spec surfaced a real reflected-input issue: `lib/geocode.ts` echoed the raw unresolved locality into the error panel. Fixed by replacing it with a generic message that never echoes user input.

Production smoke results belong in the deployment handoff only after they are rerun against the deployed build.

Do not invent pass results—re-run commands after code changes.
