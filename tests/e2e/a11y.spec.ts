import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('form meets automated WCAG A/AA checks', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /create my live monsoon plan/i }).waitFor();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  expect(
    results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
    })),
  ).toEqual([]);
});
