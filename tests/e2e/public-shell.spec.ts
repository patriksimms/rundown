import { expect, test } from '@playwright/test';

test('the signed-out product shell is usable', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Describe the report. Fine-tune it in the browser.',
    }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  await expect(page.getByText('Client reporting without the rebuild')).toBeVisible();
});

test('health and readiness retain distinct contracts', async ({ request }) => {
  const health = await request.get('/health');
  expect(health.ok()).toBe(true);
  await expect(health.json()).resolves.toMatchObject({ status: 'ok' });

  const readiness = await request.get('/ready');
  expect([200, 503]).toContain(readiness.status());
  await expect(readiness.json()).resolves.toHaveProperty('status');
});
