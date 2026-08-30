import { expect, test, type Locator } from '@playwright/test';

const opacityOf = (locator: Locator) =>
  locator.evaluate((element) => Number(getComputedStyle(element).opacity));

test('the signed-out product shell is usable', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Describe the report. Fine-tune it in the browser.',
    }),
  ).toBeVisible();
  await expect(page.getByRole('banner').getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(
    page.getByRole('main').getByRole('button', { name: 'Create account' }).first(),
  ).toBeVisible();
  await expect(page.getByText('Client reporting without the rebuild')).toBeVisible();
});

test('the landing page serves both product screenshots', async ({ page }) => {
  await page.goto('/');

  for (const name of [/Rundown dashboard/, /Rundown datasources screen/]) {
    const screenshot = page.getByRole('img', { name });
    await expect(screenshot).toBeAttached();
    await expect
      .poll(() => screenshot.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0);
  }
});

test('sections below the fold reveal once they are scrolled into view', async ({ page }) => {
  await page.goto('/');

  const cta = page
    .locator('.reveal-on-scroll')
    .filter({ hasText: 'Point Rundown at a file you already have' });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(() => opacityOf(cta)).toBeGreaterThan(0.95);
  await expect(cta.getByRole('button', { name: 'Create account' })).toBeVisible();
});

test('reduced motion renders every section without scrolling', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  const opacities = await page
    .locator('.reveal-on-scroll')
    .evaluateAll((elements) =>
      elements.map((element) => Number(getComputedStyle(element).opacity)),
    );
  expect(opacities.length).toBeGreaterThan(0);
  expect(opacities.every((opacity) => opacity === 1)).toBe(true);
});

test('health and readiness retain distinct contracts', async ({ request }) => {
  const health = await request.get('/health');
  expect(health.ok()).toBe(true);
  await expect(health.json()).resolves.toMatchObject({ status: 'ok' });

  const readiness = await request.get('/ready');
  expect([200, 503]).toContain(readiness.status());
  await expect(readiness.json()).resolves.toHaveProperty('status');
});
