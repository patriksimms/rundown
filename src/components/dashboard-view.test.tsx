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
        rows={[{ dimension_1: '9223372036854775807', metric_1: '1234.5' }]}
        columns={[dimension, currency]}
      />,
    );

    expect(html).toContain('--color-metric_1');
    expect(html).not.toContain('--color-Spend');
    expect(html).not.toContain('body { color: red');
  });

  it('renders breakdown dimensions as separate stable bar series', () => {
    const html = renderToStaticMarkup(
      <Result
        definition={{
          type: 'bar',
          title: 'Spend by channel',
          dataSourceId: 'source',
          dateRangeFieldId: 'date',
          dimension: { fieldId: 'account' },
          breakdownDimension: { fieldId: 'channel' },
          metric: {
            source: { kind: 'field', fieldId: 'spend', aggregation: 'sum' },
            dataType: 'currency',
          },
        }}
        rows={[
          { dimension_1: 'A', dimension_2: 'Paid Search', metric_1: '10' },
          { dimension_1: 'A', dimension_2: 'Social', metric_1: '20' },
        ]}
        columns={[
          dimension,
          { ...dimension, key: 'dimension_2', label: 'Channel', dataType: 'text' },
          currency,
        ]}
      />,
    );
    expect(html).toContain('--color-breakdown_1');
    expect(html).toContain('--color-breakdown_2');
    expect(html).not.toContain('--color-Paid Search');
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
        rows={[{ dimension_1: '9223372036854775807', metric_1: '1234.5' }]}
        columns={[dimension, currency]}
      />,
    );

    expect(html).toContain('9223372036854775807');
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
    expect(
      formatValue('3599.6', {
        key: 'metric_1',
        label: 'Time',
        kind: 'metric',
        dataType: 'duration',
      }),
    ).toBe('1h');
    expect(
      formatValue('1234', {
        key: 'metric_1',
        label: 'Count',
        kind: 'metric',
        dataType: 'number',
        radix: 0,
      }),
    ).toMatch(/1[,.]234/u);
    expect(
      formatValue('1234.567', {
        key: 'metric_1',
        label: 'Average',
        kind: 'metric',
        dataType: 'number',
        radix: 2,
      }),
    ).toMatch(/1[,.]234[,.]57/u);
    expect(formatValue('9223372036854775807', dimension)).toBe('9223372036854775807');
    expect(formatValue('9223372036854775807', currency)).toBe('9223372036854775807');
  });
});
