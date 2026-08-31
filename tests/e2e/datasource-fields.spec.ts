import { expect, test } from '@playwright/test';
import { mockRundownApi } from './support/rundown-api';

test.use({ viewport: { width: 375, height: 812 } });

test('a datasource opens from the overview and its fields stay editable on a phone', async ({
  page,
}) => {
  await mockRundownApi(page);
  await page.goto('/datasources');

  // The overview lists every datasource and each name opens its detail page.
  const datasource = page.getByRole('link', { name: 'Reporting example' });
  await expect(datasource).toBeVisible({ timeout: 20_000 });
  await datasource.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Reporting example' })).toBeVisible();

  // Search narrows the field table without losing the rest of the page.
  const search = page.getByLabel('Search fields');
  await expect(page.getByRole('cell', { name: 'campaign', exact: true })).toBeVisible();
  await search.fill('media cost');
  await expect(page.getByRole('cell', { name: 'campaign', exact: true })).toBeHidden();
  await expect(page.getByRole('cell', { name: 'media_cost', exact: true })).toBeVisible();
  await search.fill('');

  // Editing happens in a dialog, so a narrowed search can never hide a field mid-edit.
  const edit = page.getByRole('button', { name: 'Edit Media cost' });
  await edit.click();
  await expect(page.getByRole('heading', { name: 'Edit Media cost' })).toBeVisible();

  const saved = page.waitForResponse(
    (response) =>
      response.url().includes('/api/rundown') &&
      response.request().postDataJSON()?.action === 'updateFieldMetadata',
  );
  await page.getByLabel('Label', { exact: true }).fill('Spend');
  await page.getByRole('button', { name: 'Save field' }).click();
  await saved;

  // The dialog closes onto the saved value, and the keyboard caret is not dropped
  // to the document.
  await expect(page.getByRole('button', { name: 'Save field' })).toBeHidden();
  await expect(page.getByRole('cell', { name: 'Spend', exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toBeFocused();
});
