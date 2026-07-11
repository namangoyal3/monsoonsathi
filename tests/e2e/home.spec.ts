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

test('device memory is opt-in, restores basics, and forgets them', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(/locality or pincode/i).fill('Ludhiana');
  await page.getByText('family', { exact: true }).click();
  await page.getByText('Respond', { exact: true }).click();
  await page.getByText('Essential medicines', { exact: true }).click();
  await page.getByText(/add travel or context/i).click();
  await page.getByLabel(/^destination/i).fill('Delhi');
  await page.getByLabel(/anything else/i).fill('Dialysis on alternate days');
  await page.getByText('Remember basic preferences on this device', { exact: true }).click();

  const saved = await page.evaluate(() =>
    window.localStorage.getItem('monsoonsathi:preferences:v1')
  );
  expect(saved).toContain('Ludhiana');
  expect(saved).not.toContain('Delhi');
  expect(saved).not.toContain('Dialysis');
  expect(saved).not.toContain('needsEssentialMedicines');
  expect(saved).not.toContain('during');

  await page.reload();
  await expect(page.getByLabel(/locality or pincode/i)).toHaveValue('Ludhiana');
  await expect(page.getByRole('radio', { name: /family/i })).toBeChecked();
  await expect(page.getByRole('radio', { name: /prepare/i })).toBeChecked();
  await expect(page.getByLabel(/remember basic preferences/i)).toBeChecked();
  await expect(page.getByLabel(/essential medicines/i)).not.toBeChecked();

  await page.getByText('Remember basic preferences on this device', { exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.localStorage.getItem('monsoonsathi:preferences:v1'))
    )
    .toBeNull();
});
