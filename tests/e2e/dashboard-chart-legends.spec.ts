import { expect, test } from '@playwright/test';
import { mockRundownApi } from './support/rundown-api';

test('charts show legends without widget configuration', async ({ page }) => {
  const state = await mockRundownApi(page, { role: 'editor' });
  state.dashboard.widgets.push(
    {
      id: 'w_chart',
      layout: { x: 0, y: 7, width: 8, height: 5 },
      definitionHash: 'hash_w_chart',
      definition: {
        type: 'bar',
        title: 'Spend by campaign',
        dataSourceId: 'src_reporting',
        dateRangeFieldId: 'f_date',
        metric: {
          source: { kind: 'field', fieldId: 'f_spend', aggregation: 'sum' },
          dataType: 'currency',
        },
        dimension: { fieldId: 'f_campaign' },
      },
    },
    {
      id: 'w_line_chart',
      layout: { x: 0, y: 12, width: 8, height: 5 },
      definitionHash: 'hash_w_line_chart',
      definition: {
        type: 'line',
        title: 'Spend trend',
        dataSourceId: 'src_reporting',
        dateRangeFieldId: 'f_date',
        metrics: [
          {
            source: { kind: 'field', fieldId: 'f_spend', aggregation: 'sum' },
            dataType: 'currency',
          },
        ],
        dimension: { fieldId: 'f_campaign' },
      },
    },
    {
      id: 'w_pie_chart',
      layout: { x: 0, y: 17, width: 8, height: 5 },
      definitionHash: 'hash_w_pie_chart',
      definition: {
        type: 'pie',
        title: 'Spend share',
        dataSourceId: 'src_reporting',
        dateRangeFieldId: 'f_date',
        metric: {
          source: { kind: 'field', fieldId: 'f_spend', aggregation: 'sum' },
          dataType: 'currency',
        },
        dimension: { fieldId: 'f_campaign' },
      },
    },
  );

  await page.goto('/dashboards/dash_demo');
  const bar = page.locator('.react-grid-item').filter({ hasText: 'Spend by campaign' });
  const line = page.locator('.react-grid-item').filter({ hasText: 'Spend trend' });
  const pie = page.locator('.react-grid-item').filter({ hasText: 'Spend share' });
  await expect(bar.locator('.recharts-bar-rectangle')).toHaveCount(2);
  await expect(bar.locator('.recharts-legend-wrapper')).toContainText('Media cost');
  await expect(line.locator('.recharts-legend-wrapper')).toContainText('Media cost');
  await expect(pie.locator('.recharts-legend-wrapper')).toContainText('Spring sale');
  await expect(pie.locator('.recharts-legend-wrapper')).toContainText('Always on');

  await page.getByRole('button', { name: 'Edit Spend by campaign' }).click();
  await expect(page.getByRole('complementary').getByRole('switch')).toHaveCount(0);
});
