import { test, expect } from '@playwright/test';

test('home form is labelled and keyboard-reachable', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /know what to do/i })).toBeVisible();
  await expect(page.getByLabel(/locality or pincode/i)).toBeVisible();
  await expect(
    page.getByRole('button', { name: /create my live monsoon plan/i })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /family · during/i })).toBeVisible();

  await page.getByLabel(/locality or pincode/i).fill('Bengaluru');
  await page.getByRole('button', { name: /create my live monsoon plan/i }).focus();
  await expect(page.getByRole('button', { name: /create my live monsoon plan/i })).toBeFocused();
});

test('demo chip fills form without inventing a plan', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /family · during/i }).click();
  await expect(page.getByRole('radio', { name: /family/i })).toBeChecked();
  await expect(page.getByRole('heading', { name: /your monsoon action plan/i })).toHaveCount(0);
});
