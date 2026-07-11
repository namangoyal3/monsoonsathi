import { test, expect } from '@playwright/test';

// One real end-to-end submit: live geocode + live weather + one live Gemini call.
test('submit form and receive a live plan dashboard', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');

  await page.getByLabel(/locality or pincode/i).fill('Indiranagar, Bengaluru');
  await page.getByRole('button', { name: /create my live monsoon plan/i }).click();

  // Plan heading appears once the live pipeline finishes.
  const planTitle = page.locator('#plan-title');
  await expect(planTitle).toBeVisible({ timeout: 60_000 });

  // Live weather fact labelling is present.
  await expect(page.getByText(/live weather/i).first()).toBeVisible();

  // At least one generated action item exists (checklist or do-now list).
  const items = page.locator('main li');
  expect(await items.count()).toBeGreaterThan(0);
});
