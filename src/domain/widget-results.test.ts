import { describe, expect, it } from 'vitest';
import {
  alignDateComparisonRows,
  pieBreakdownRows,
  pivotBreakdownRows,
  seriesMetricIndex,
  tableSummaryDefinition,
  withComparisonSeries,
} from './widget-results';

describe('widget result shaping', () => {
  const breakdown = [
    { month: 'Jan', channel: 'Search', spend: 10 },
    { month: 'Jan', channel: 'Social', spend: 20 },
    { month: 'Feb', channel: 'Search', spend: 30 },
  ];

  it('pivots breakdown text into bar series', () => {
    expect(pivotBreakdownRows(breakdown)).toEqual({
      rows: [
        { month: 'Jan', Search: 10, Social: 20 },
        { month: 'Feb', Search: 30 },
      ],
      series: ['Search', 'Social'],
    });
  });

  it('defines pie breakdowns as labelled slices', () => {
    expect(pieBreakdownRows(breakdown)[0]).toEqual({ label: 'Jan · Search', spend: 10 });
  });

  it('adds comparison values as visible chart series', () => {
    expect(
      withComparisonSeries([{ month: 'Jan', spend: 20 }], [{ month: 'Dec', spend: 10 }]),
    ).toEqual([{ month: 'Jan', spend: 20, comparison_0: 10 }]);
  });

  it('aligns categorical comparisons by their dimension value', () => {
    expect(
      withComparisonSeries(
        [
          { campaign: 'A', spend: 100 },
          { campaign: 'B', spend: 10 },
        ],
        [
          { campaign: 'B', spend: 50 },
          { campaign: 'A', spend: 5 },
        ],
        'key',
      ),
    ).toEqual([
      { campaign: 'A', spend: 100, comparison_0: 5 },
      { campaign: 'B', spend: 10, comparison_0: 50 },
    ]);
  });

  it('keeps dimensions that exist only in the comparison period', () => {
    expect(
      withComparisonSeries(
        [{ campaign: 'A', spend: 100 }],
        [
          { campaign: 'A', spend: 50 },
          { campaign: 'B', spend: 25 },
        ],
        'key',
      ),
    ).toEqual([
      { campaign: 'A', spend: 100, comparison_0: 50 },
      { campaign: 'B', spend: undefined, comparison_0: 25 },
    ]);
  });

  it('normalizes shifted date comparisons without moving sparse buckets', () => {
    expect(
      alignDateComparisonRows(
        [
          { day: '2026-01-01', spend: 5 },
          { day: '2026-01-03', spend: 7 },
        ],
        'previousPeriod',
        { start: '2026-01-04', end: '2026-01-06' },
      ),
    ).toEqual([
      { day: '2026-01-04', spend: 5 },
      { day: '2026-01-06', spend: 7 },
    ]);
  });

  it('normalizes database date objects', () => {
    expect(
      alignDateComparisonRows(
        [new Date('2025-02-28T00:00:00Z')].map((day) => ({ day })),
        'previousYear',
        {
          start: '2026-01-01',
          end: '2026-12-31',
        },
      ),
    ).toEqual([{ day: new Date('2026-02-28T00:00:00Z') }]);
  });

  it('preserves timestamp precision while shifting comparison dates', () => {
    expect(
      alignDateComparisonRows([{ hour: '2026-01-01T14:30:00.000Z', spend: 5 }], 'previousPeriod', {
        start: '2026-01-02',
        end: '2026-01-02',
      }),
    ).toEqual([{ hour: '2026-01-02T14:30:00.000Z', spend: 5 }]);
  });

  it('maps previous series back to their source metric', () => {
    expect(seriesMetricIndex('comparison_1', ['count', 'rate'])).toBe(1);
  });

  it('keeps comparison series for sparse breakdowns', () => {
    const current = pivotBreakdownRows([
      { month: 'Jan', channel: 'Search', spend: 10 },
      { month: 'Feb', channel: 'Social', spend: 20 },
    ]);
    const previous = pivotBreakdownRows([
      { month: 'Jan', channel: 'Search', spend: 5 },
      { month: 'Feb', channel: 'Social', spend: 15 },
    ]);
    expect(withComparisonSeries(current.rows, previous.rows, 'key', current.series)).toEqual([
      { month: 'Jan', Search: 10, comparison_0: 5, comparison_1: undefined },
      { month: 'Feb', Social: 20, comparison_0: undefined, comparison_1: 15 },
    ]);
  });

  it('builds an unpaged aggregate query for table summaries', () => {
    const definition = {
      type: 'table' as const,
      title: 'Table',
      dataSourceId: 'source',
      dateRangeFieldId: 'date',
      dimensions: [{ fieldId: 'campaign' }],
      metrics: [
        {
          source: { kind: 'field' as const, fieldId: 'spend', aggregation: 'sum' as const },
          dataType: 'number' as const,
        },
      ],
      resultLimit: { mode: 'pagination' as const, amount: 20 },
      showSummaryRow: true,
      sort: [{ target: { kind: 'metric' as const, index: 0 }, direction: 'desc' as const }],
    };
    expect(tableSummaryDefinition(definition)).toMatchObject({
      dimensions: [],
      resultLimit: { mode: 'top', amount: 1 },
      showSummaryRow: false,
      sort: undefined,
    });
  });
});
