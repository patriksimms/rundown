import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChartContainer, ChartTooltipContent } from './chart';

describe('chart tooltip content', () => {
  it('formats multiple values without removing series labels or indicators', () => {
    const html = renderToStaticMarkup(
      <ChartContainer
        config={{
          metric_1: { label: 'Spend', color: 'red' },
          metric_2: { label: 'Clicks', color: 'blue' },
        }}
      >
        <ChartTooltipContent
          active
          payload={[
            {
              name: 'metric_1',
              dataKey: 'metric_1',
              graphicalItemId: 'metric_1',
              value: 1234.5,
              color: 'red',
            },
            {
              name: 'metric_2',
              dataKey: 'metric_2',
              graphicalItemId: 'metric_2',
              value: 250,
              color: 'blue',
            },
          ]}
          valueFormatter={(value) => `€${value}`}
        />
      </ChartContainer>,
    );

    expect(html).toContain('Spend');
    expect(html).toContain('Clicks');
    expect(html).toContain('€1234.5');
    expect(html).toContain('€250');
    expect(html).toContain('--color-bg:red');
    expect(html).toContain('--color-bg:blue');
  });

  it('retains a pie slice name while formatting its metric value', () => {
    const html = renderToStaticMarkup(
      <ChartContainer config={{ metric_1: { label: 'Spend', color: 'red' } }}>
        <ChartTooltipContent
          active
          payload={[
            {
              name: 'Search',
              dataKey: 'metric_1',
              graphicalItemId: 'metric_1',
              value: 1234.5,
              payload: { dimension_1: 'Search', metric_1: 1234.5, fill: 'red' },
            },
          ]}
          valueFormatter={(value) => `€${value}`}
        />
      </ChartContainer>,
    );

    expect(html).toContain('Search');
    expect(html).toContain('€1234.5');
    expect(html).toContain('--color-bg:red');
  });
});
