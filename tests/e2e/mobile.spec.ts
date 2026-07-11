import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('mobile viewport: form usable, no horizontal scroll', async ({ page }) => {
  await page.goto('/');

  // No horizontal overflow.
  const overflow = await page.evaluate(() => {
    const el = document.scrollingElement!;
    return el.scrollWidth - el.clientWidth;
  });
  expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(1);

  // Core controls are usable on a phone.
  const locality = page.getByLabel(/locality or pincode/i);
  await locality.scrollIntoViewIfNeeded();
  await expect(locality).toBeVisible();
  await locality.fill('Indiranagar');

  const submit = page.getByRole('button', { name: /create my live monsoon plan/i });
  await submit.scrollIntoViewIfNeeded();
  await expect(submit).toBeVisible();
});
