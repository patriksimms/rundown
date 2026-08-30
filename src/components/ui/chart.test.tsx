import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChartContainer, ChartTooltipContent } from './chart';

describe('chart tooltip content', () => {
  it('formats the value without removing its series label or indicator', () => {
    const html = renderToStaticMarkup(
      <ChartContainer config={{ metric_1: { label: 'Spend', color: 'red' } }}>
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
          ]}
          valueFormatter={(value) => `€${value}`}
        />
      </ChartContainer>,
    );

    expect(html).toContain('Spend');
    expect(html).toContain('€1234.5');
    expect(html).toContain('--color-bg:red');
  });
});
