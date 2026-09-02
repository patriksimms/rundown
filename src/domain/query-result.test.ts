import { describe, expect, it } from 'vitest';
import { queryResultColumns } from './query-result';

const metadata = {
  fields: [
    { id: 'channel', label: 'Channel', semanticType: 'text' as const },
    { id: 'spend', label: 'Spend', semanticType: 'currency' as const },
  ],
  calculatedFields: [],
  libraryMetrics: [],
};

describe('query result columns', () => {
  it('keeps user labels separate from stable result keys', () => {
    const columns = queryResultColumns(
      {
        type: 'line',
        title: 'Spend',
        dataSourceId: 'source',
        dateRangeFieldId: 'date',
        dimension: { fieldId: 'channel', userDefinedName: 'Channel label' },
        metrics: [
          {
            source: { kind: 'field', fieldId: 'spend', aggregation: 'sum' },
            userDefinedName: 'Spend }; body { color: red; } /*',
            dataType: 'currency',
          },
          {
            source: { kind: 'field', fieldId: 'spend', aggregation: 'average' },
            userDefinedName: 'Spend }; body { color: red; } /*',
            dataType: 'currency',
          },
        ],
      },
      metadata,
    );

    expect(columns.map(({ key, label }) => ({ key, label }))).toEqual([
      { key: 'dimension_1', label: 'Channel label' },
      { key: 'metric_1', label: 'Spend }; body { color: red; } /*' },
      { key: 'metric_2', label: 'Spend }; body { color: red; } /*' },
    ]);
  });

  it('threads metric conditional formatting into result columns', () => {
    const columns = queryResultColumns(
      {
        type: 'table',
        title: 'Spend',
        dataSourceId: 'source',
        dateRangeFieldId: 'date',
        dimensions: [{ fieldId: 'channel' }],
        metrics: [
          {
            source: { kind: 'field', fieldId: 'spend', aggregation: 'sum' },
            dataType: 'currency',
            conditionalFormat: [{ comparator: 'gte', value: 100, color: 'warning' }],
          },
        ],
        resultLimit: { mode: 'top', amount: 20 },
      },
      metadata,
    );

    expect(columns[1]?.conditionalFormat).toEqual([
      { comparator: 'gte', value: 100, color: 'warning' },
    ]);
  });

  it('places the table pivot dimension after row dimensions', () => {
    const columns = queryResultColumns(
      {
        type: 'table',
        title: 'Spend',
        dataSourceId: 'source',
        dateRangeFieldId: 'date',
        dimensions: [{ fieldId: 'channel' }],
        pivotDimension: { fieldId: 'spend', userDefinedName: 'Month' },
        metrics: [
          {
            source: { kind: 'field', fieldId: 'spend', aggregation: 'sum' },
            dataType: 'currency',
          },
        ],
        resultLimit: { mode: 'top', amount: 20 },
      },
      metadata,
    );

    expect(columns.map((column) => column.label)).toEqual(['Channel', 'Month', 'Spend']);
  });
});
