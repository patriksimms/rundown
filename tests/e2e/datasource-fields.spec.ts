import { expect, test, type Page } from '@playwright/test';
import { mockRundownApi } from './support/rundown-api';

test.use({ viewport: { width: 375, height: 812 } });

const fieldCard = (page: Page, column: string) =>
  page.getByRole('listitem').filter({ hasText: column });

test('searching the field list keeps unsaved edits and keeps focus after a save', async ({
  page,
}) => {
  await mockRundownApi(page);
  await page.goto('/datasources');

  const search = page.getByLabel('Find a field');
  await expect(search).toBeVisible({ timeout: 20_000 });
  const campaignLabel = fieldCard(page, 'Campaign').getByLabel('Label');
  const costCard = fieldCard(page, 'MediaCost');
  const costLabel = costCard.getByLabel('Label');

  // A draft edit survives searching the field out of view and back.
  await campaignLabel.fill('Campaign name');
  await search.fill('cost');
  await expect(page.getByText('1 of 5 fields')).toBeVisible();
  await expect(campaignLabel).toBeHidden();
  await search.fill('');
  await expect(campaignLabel).toHaveValue('Campaign name');

  // Editing a field out of its own search result keeps focus on the control that did it.
  await search.fill('media cost');
  await expect(page.getByText('1 of 5 fields')).toBeVisible();
  await costLabel.fill('Spend');
  const save = costCard.getByRole('button', { name: 'Save MediaCost' });
  await save.focus();
  // Focus is already on the button, so the save has to land before the assertion means anything.
  const saved = page.waitForResponse(
    (response) =>
      response.url().includes('/api/rundown') &&
      response.request().postDataJSON()?.action === 'updateFieldMetadata',
  );
  await page.keyboard.press('Enter');
  await saved;
  await expect(page.getByText('0 of 5 fields')).toBeVisible();
  await expect(save).toBeFocused();
  await expect(costLabel).toBeVisible();

  // It leaves the filtered list once focus moves on.
  await search.focus();
  await expect(costLabel).toBeHidden();
});
