import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('axe: no serious or critical violations on the form page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /create my live monsoon plan/i }).waitFor();

  const results = await new AxeBuilder({ page }).analyze();
  const severe = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );

  expect(
    severe.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
    })),
  ).toEqual([]);
});
