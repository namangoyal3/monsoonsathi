import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { reserveLivePlanSlot } from './throttle';

const scenarios = [
  {
    name: 'family during English',
    demo: /family · during · en/i,
    lang: 'en',
    support: true,
    a11y: true,
  },
  { name: 'community after Kannada', demo: /community · after · kn/i, lang: 'kn', support: true },
  { name: 'individual before Hindi', demo: /individual · before · hi/i, lang: 'hi' },
  { name: 'travel stress English', demo: /travel stress · en/i, lang: 'en', travel: true },
] as const;

for (const scenario of scenarios) {
  test(`live demo: ${scenario.name}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/');
    await page.getByRole('button', { name: scenario.demo }).click();
    // Pace live submits to protect provider quotas across consecutive runs.
    await reserveLivePlanSlot();
    await page.getByRole('button', { name: /create my live monsoon plan/i }).click();

    await expect(page.locator('#plan-title')).toBeVisible({ timeout: 65_000 });
    await expect(page.getByText(/live weather fact/i)).toBeVisible();
    await expect(page.getByText(/Live GenAI · [1-9]/)).toBeVisible();
    await expect(page.locator('.action-card').first()).toBeVisible();
    await expect(page.locator('.source-card').first()).toBeVisible();
    await expect(page.locator(`[lang="${scenario.lang}"]`).first()).toBeVisible();

    if ('support' in scenario && scenario.support) {
      await expect(page.locator('#support-title')).toBeVisible();
    }
    if ('travel' in scenario && scenario.travel) {
      const travelTitle = page.locator('#travel-title');
      await expect(travelTitle).toBeVisible();
      await expect(travelTitle).not.toContainText(/recommendation:\s*go/i);
    }
    if ('a11y' in scenario && scenario.a11y) {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(
        results.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
        }))
      ).toEqual([]);
    }
  });
}
