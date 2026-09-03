import { expect, test, type Locator, type Page } from '@playwright/test';
import { clerkCredentials, missingClerkCredentials } from './support/clerk-credentials';
import { signInWithClerk } from './support/clerk-session';
import { callApi, seedDashboard, seedDataSource, seedImpressionsDashboard } from './support/seed';

const credentials = clerkCredentials();

// The seeded CSV totals 445 across both regions and 320 in the north.
const TOTAL_REVENUE = '445';
const NORTH_REVENUE = '320';
const TOTAL_IMPRESSIONS = '44,500';
const NARROWED_IMPRESSIONS = '25,080';

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
    await expect(widget(page, 'Revenue')).toContainText(TOTAL_REVENUE, { timeout: 20_000 });

    // Rename the widget through the builder sidebar.
    await page.getByRole('button', { name: 'Edit Revenue' }).click();
    const settings = page.getByRole('complementary');
    const title = settings.getByLabel('Title');
    await expect(title).toHaveValue('Revenue');
    await title.fill('Revenue, verified');
    await title.blur();
    await expect(settings.getByRole('heading', { name: 'Revenue, verified' })).toBeVisible();
    await expect(widget(page, 'Revenue, verified')).toBeVisible();

    // Narrow the dashboard with its filter control and let the widget requery.
    await page.getByRole('button', { name: 'Choose Region values' }).click();
    await page.getByRole('option', { name: 'north' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Remove north' })).toBeVisible();
    await expect(widget(page, 'Revenue, verified')).toContainText(NORTH_REVENUE);

    // The edit survives a reload; control selections last for one visit.
    await page.reload();
    await expect(widget(page, 'Revenue, verified')).toContainText(TOTAL_REVENUE);
    await expect(page.getByRole('button', { name: 'Choose Region values' })).toContainText(
      'All values',
    );

    // Share the dashboard and open the link without a session.
    await page.getByRole('button', { name: 'Share' }).click();
    const shareLink = page.getByRole('link', { name: /\/share\// });
    await page.getByRole('button', { name: 'Create unlisted link' }).click();
    await expect(shareLink).toBeVisible();
    // The dialog shows the absolute link so it can be pasted straight into a message.
    const shareUrl = await shareLink.innerText();
    expect(shareUrl).toMatch(/^https?:\/\/[^/]+\/share\/.+/);

    // Chromium only hands out the clipboard contents to a test that asked for the permission.
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'Copy unlisted link' }).click();
    await expect(page.getByRole('button', { name: 'Copied unlisted link' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(shareUrl);

    const viewer = await browser.newContext();
    try {
      const viewerPage = await viewer.newPage();
      await viewerPage.goto(shareUrl);
      await expect(
        viewerPage.getByRole('heading', { level: 1, name: `E2E dashboard ${suffix}` }),
      ).toBeVisible();
      await expect(viewerPage.getByText(TOTAL_REVENUE)).toBeVisible();
      await expect(viewerPage.getByText('Revenue, verified')).toBeVisible();
      // Viewers get the stored dashboard, never the builder.
      await expect(viewerPage.getByRole('button', { name: 'Share' })).toHaveCount(0);
      await expect(viewerPage.getByRole('button', { name: /^Edit / })).toHaveCount(0);
    } finally {
      await viewer.close();
    }
  });

  test('the dashboard index lists what the signed-in workspace owns', async ({ page }) => {
    test.slow();
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

  test('an impressions dashboard shows the total calculated from its uploaded CSV', async ({
    page,
  }) => {
    test.slow();
    await signIn(page);

    const suffix = Date.now().toString(36);
    const source = await seedDataSource(page, `e2e-impressions-${suffix}`);
    expect(source.fields.find((field) => field.columnName === 'Date')).toMatchObject({
      role: 'dimension',
      semanticType: 'date',
    });
    const dashboard = await seedImpressionsDashboard(page, `E2E impressions ${suffix}`, source);

    await page.goto(`/dashboards/${dashboard.id}`);
    const scorecard = widget(page, 'Impressions');
    const line = widget(page, 'Impressions over time');
    await expect(scorecard.getByText(TOTAL_IMPRESSIONS, { exact: true })).toBeVisible();
    await line.scrollIntoViewIfNeeded();
    await expect(line.getByRole('img', { name: 'Impressions over time chart' })).toBeVisible({
      timeout: 45_000,
    });
    await expect(line.getByText('No rows for this date range.')).toHaveCount(0);

    await page.getByRole('button', { name: 'Choose date range' }).click();
    const rangeStart = page.getByRole('button', { name: /January 6th, 2026/u });
    await rangeStart.click();
    await expect(rangeStart).toHaveAttribute('data-selected-single', 'true');
    await page.getByRole('button', { name: /January 7th, 2026/u }).click();
    await expect(scorecard.getByText(NARROWED_IMPRESSIONS, { exact: true })).toBeVisible();
    await line.scrollIntoViewIfNeeded();
    await expect(line.getByText('Jan 6', { exact: true })).toBeVisible({ timeout: 45_000 });
    await expect(line.getByText('Jan 7', { exact: true })).toBeVisible();
  });
});

/** The builder item holding the widget with this title. */
function widget(page: Page, title: string): Locator {
  return page
    .locator('[data-widget-id]')
    .filter({ has: page.getByRole('button', { name: `Edit ${title}`, exact: true }) });
}

/** Signs the Clerk test user in and makes sure an organization is active. */
async function signIn(page: Page) {
  if (!credentials) throw new Error(missingClerkCredentials);
  await signInWithClerk(page, credentials);
  await activateWorkspace(page);
}

/**
 * The app requires an active Clerk organization. A test user that has one lands on the
 * dashboard index; otherwise the workspace gate offers a membership or a new workspace.
 */
async function activateWorkspace(page: Page) {
  const index = page.getByRole('heading', { level: 1, name: 'Dashboards' });
  const gate = page.getByRole('heading', { level: 1, name: 'Choose where to continue' });
  await expect(index.or(gate)).toBeVisible({ timeout: 20_000 });
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
