import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Paces live /api/plan submits across spec files and consecutive runs so the
 * suite protects live-provider quotas (the app allows 30/min per IP; locally every
 * request shares the `plan:unknown` bucket because there is no
 * x-forwarded-for header).
 *
 * Ledger lives in os.tmpdir() so it survives across runs — two back-to-back
 * `npm run test:e2e` invocations stay under the cap instead of failing the
 * second run. Playwright runs with workers: 1 (serial), so file access is
 * effectively single-writer; no lock needed.
 */
const LEDGER = path.join(os.tmpdir(), 'monsoonsathi-e2e-plan-ledger.json');
const WINDOW_MS = 60_000;
/** Conservative test budget; production allows 30/min but providers may not. */
const MAX_IN_WINDOW = 6;

export async function reserveLivePlanSlot(): Promise<void> {
  for (;;) {
    const now = Date.now();
    let stamps: number[] = [];
    try {
      const raw = await fs.readFile(LEDGER, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        stamps = parsed.filter((t): t is number => typeof t === 'number');
      }
    } catch {
      // missing or corrupt ledger — start fresh
    }
    const recent = stamps.filter((t) => now - t < WINDOW_MS);
    if (recent.length < MAX_IN_WINDOW) {
      recent.push(now);
      await fs.writeFile(LEDGER, JSON.stringify(recent));
      return;
    }
    const oldest = Math.min(...recent);
    const waitMs = Math.min(WINDOW_MS, WINDOW_MS - (now - oldest) + 250);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}
