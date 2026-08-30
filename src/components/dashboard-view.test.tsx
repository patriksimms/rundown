import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { formatValue, Result } from './dashboard-view';
import type { QueryResultColumn } from '#/domain/query-result';

const dimension: QueryResultColumn = {
  key: 'dimension_1',
  label: 'Account ID',
  kind: 'dimension',
  dataType: 'id',
};
const currency: QueryResultColumn = {
  key: 'metric_1',
  label: 'Spend }; body { color: red; } /*',
  kind: 'metric',
  dataType: 'currency',
  radix: 2,
};

describe('dashboard result rendering', () => {
  it('uses stable chart keys while retaining the custom display label', () => {
    const html = renderToStaticMarkup(
      <Result
        definition={{
          type: 'bar',
          title: 'Spend',
          dataSourceId: 'source',
          dateRangeFieldId: 'date',
          dimension: { fieldId: 'account' },
          metric: {
            source: { kind: 'field', fieldId: 'spend', aggregation: 'sum' },
            userDefinedName: currency.label,
            dataType: 'currency',
          },
        }}
        rows={[{ dimension_1: '001234', metric_1: '1234.5' }]}
        columns={[dimension, currency]}
      />,
    );

    expect(html).toContain('--color-metric_1');
    expect(html).not.toContain('--color-Spend');
    expect(html).not.toContain('body { color: red');
  });

  it('formats metric strings while preserving dimension strings', () => {
    const html = renderToStaticMarkup(
      <Result
        definition={{
          type: 'table',
          title: 'Accounts',
          dataSourceId: 'source',
          dateRangeFieldId: 'date',
          dimensions: [{ fieldId: 'account' }],
          metrics: [
            {
              source: { kind: 'field', fieldId: 'spend', aggregation: 'sum' },
              dataType: 'currency',
              displayFormat: { radix: 2 },
            },
          ],
          resultLimit: { mode: 'top', amount: 10 },
        }}
        rows={[{ dimension_1: '001234', metric_1: '1234.5' }]}
        columns={[dimension, currency]}
      />,
    );

    expect(html).toContain('001234');
    expect(html).toMatch(/1[,.]234[,.]50/u);
  });

  it('applies percent, duration, and radix formatting to numeric strings', () => {
    expect(
      formatValue('0.125', {
        key: 'metric_1',
        label: 'Rate',
        kind: 'metric',
        dataType: 'percent',
        radix: 1,
      }),
    ).toBe('12.5%');
    expect(
      formatValue('3661', {
        key: 'metric_1',
        label: 'Time',
        kind: 'metric',
        dataType: 'duration',
      }),
    ).toBe('1h 1m 1s');
    expect(formatValue('001234', dimension)).toBe('001234');
  });
});
