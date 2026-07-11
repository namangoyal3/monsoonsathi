import { test, expect } from '@playwright/test';

test('form is operable with keyboard only and focus is visible', async ({ page }) => {
  await page.goto('/');

  // Reach the locality field with Tab alone and type into it.
  const locality = page.getByLabel(/locality or pincode/i);
  let reached = false;
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    if (await locality.evaluate((el) => el === document.activeElement)) {
      reached = true;
      break;
    }
  }
  expect(reached, 'locality input reachable via Tab').toBe(true);
  await page.keyboard.type('Koramangala, Bengaluru');
  await expect(locality).toHaveValue('Koramangala, Bengaluru');

  // Continue tabbing to the submit button.
  const submit = page.getByRole('button', { name: /create my live monsoon plan/i });
  let submitFocused = false;
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    if (await submit.evaluate((el) => el === document.activeElement)) {
      submitFocused = true;
      break;
    }
  }
  expect(submitFocused, 'submit button reachable via Tab').toBe(true);

  // Keyboard focus must be visibly indicated.
  const visible = await submit.evaluate((el) => {
    const s = getComputedStyle(el);
    return (
      (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) ||
      s.boxShadow !== 'none'
    );
  });
  expect(visible, 'focus indicator on submit button').toBe(true);
});
