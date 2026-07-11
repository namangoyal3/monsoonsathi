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
| E2E | Home labels, demo chips fill form only, submit button focusable |
| Manual/live | Live plan, non-English output, community support, travel disclaimer |

Production smoke results belong in the deployment handoff only after they are rerun against the deployed build.

Do not invent pass results—re-run commands after code changes.
