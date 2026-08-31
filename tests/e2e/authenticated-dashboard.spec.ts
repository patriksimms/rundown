import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test, type Page } from '@playwright/test';
import { clerkCredentials, missingClerkCredentials } from './support/clerk-credentials';
import { callApi, seedDashboard, seedDataSource } from './support/seed';

const credentials = clerkCredentials();

test.describe('signed-in dashboard flow', () => {
  test.skip(!credentials, missingClerkCredentials);
  test.describe.configure({ mode: 'serial' });

  test('an editor opens a seeded dashboard, edits it, filters it, and shares it', async ({
    page,
    browser,
  }) => {
    test.slow();
    await signIn(page);

    const suffix = Date.now().toString(36);
    const source = await seedDataSource(page, `e2e-report-${suffix}`);
    const dashboard = await seedDashboard(page, `E2E dashboard ${suffix}`, source);

    await page.goto(`/dashboards/${dashboard.id}`);
    await expect(
      page.getByRole('heading', { level: 1, name: `E2E dashboard ${suffix}` }),
    ).toBeVisible();
    const scorecard = page.getByText('Revenue', { exact: true }).first();
    await expect(scorecard).toBeVisible();

    // Edit the widget through the builder sidebar.
    await scorecard.click();
    const title = page.getByLabel('Title');
    await expect(title).toHaveValue('Revenue');
    await title.fill('Revenue, verified');
    await title.blur();
    await expect(page.getByRole('heading', { name: 'Revenue, verified' })).toBeVisible();

    // Narrow the dashboard with its filter control.
    await page.getByRole('button', { name: 'Choose Region values' }).click();
    await page.getByRole('option', { name: 'north' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Choose Region values' })).toHaveText(
      /1 selected/,
    );
    await expect(page.getByRole('button', { name: 'Remove north' })).toBeVisible();

    // The edit survives a reload; control selections are per visit.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Revenue, verified' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose Region values' })).toHaveText(
      /All values/,
    );

    // Share the dashboard and open the link without a session.
    await page.getByRole('button', { name: 'Share' }).click();
    await page.getByRole('button', { name: 'Create unlisted link' }).click();
    const shareLink = page.getByRole('link', { name: /^\/share\// });
    await expect(shareLink).toBeVisible();
    const sharePath = (await shareLink.getAttribute('href')) ?? '';
    expect(sharePath).toMatch(/^\/share\/.+/);

    const viewer = await browser.newContext();
    try {
      const viewerPage = await viewer.newPage();
      await viewerPage.goto(sharePath);
      await expect(
        viewerPage.getByRole('heading', { level: 1, name: `E2E dashboard ${suffix}` }),
      ).toBeVisible();
      await expect(viewerPage.getByRole('heading', { name: 'Revenue, verified' })).toBeVisible();
      // Viewers get the stored dashboard, never the builder.
      await expect(viewerPage.getByRole('button', { name: 'Share' })).toHaveCount(0);
    } finally {
      await viewer.close();
    }
  });

  test('the dashboard index lists what the signed-in workspace owns', async ({ page }) => {
    await signIn(page);
    const suffix = Date.now().toString(36);
    const source = await seedDataSource(page, `e2e-index-${suffix}`);
    await seedDashboard(page, `E2E index ${suffix}`, source);

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboards' })).toBeVisible();
    await expect(page.getByRole('link', { name: `E2E index ${suffix}` })).toBeVisible();

    const bootstrap = await callApi<{ workspace: { id: string } }>(page, { action: 'bootstrap' });
    expect(bootstrap.workspace.id).toMatch(/^ws_/);
  });
});

/** Signs the Clerk test user in and makes sure an organization is active. */
async function signIn(page: Page) {
  if (!credentials) throw new Error(missingClerkCredentials);
  await setupClerkTestingToken({ page });
  await page.goto('/');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'password', ...credentials },
  });
  await page.goto('/');
  await activateWorkspace(page);
}

/**
 * The app requires an active Clerk organization. A test user that has one lands on the
 * dashboard index; otherwise the workspace gate offers a membership or a new workspace.
 */
async function activateWorkspace(page: Page) {
  const index = page.getByRole('heading', { level: 1, name: 'Dashboards' });
  const gate = page.getByRole('heading', { level: 1, name: 'Choose where to continue' });
  await expect(index.or(gate)).toBeVisible();
  if (await index.isVisible()) return;

  const membership = page.getByRole('button', { name: 'Continue' }).first();
  if (await membership.isVisible().catch(() => false)) {
    await membership.click();
  } else {
    await page.getByLabel('Workspace name').fill('Playwright workspace');
    await page.getByRole('button', { name: 'Create workspace' }).click();
  }
  await expect(index).toBeVisible();
}
