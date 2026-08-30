import { describe, expect, it } from 'vitest';
import {
  pieBreakdownRows,
  pivotBreakdownRows,
  tableSummary,
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

  it('summarizes metrics using their configured aggregation', () => {
    const definition = {
      type: 'table' as const,
      dimensions: [{ fieldId: 'month' }],
      metrics: [
        {
          source: { kind: 'field' as const, fieldId: 'spend', aggregation: 'sum' as const },
          dataType: 'number' as const,
        },
        {
          source: { kind: 'field' as const, fieldId: 'rate', aggregation: 'average' as const },
          dataType: 'percent' as const,
        },
      ],
    } as Extract<Parameters<typeof tableSummary>[0], { type: 'table' }>;
    const summary = tableSummary(definition, [
      { month: 'Jan', spend: 10, rate: 0.2 },
      { month: 'Feb', spend: 30, rate: 0.4 },
    ]);
    expect(summary).toMatchObject({ month: 'Summary', spend: 40 });
    expect(summary.rate).toBeCloseTo(0.3);
  });

  it('calculates non-additive summary aggregations', () => {
    const metric = (aggregation: 'median' | 'standardDeviation' | 'variance') => ({
      source: { kind: 'field' as const, fieldId: aggregation, aggregation },
      dataType: 'number' as const,
    });
    const definition = {
      type: 'table' as const,
      title: 'Summary',
      dataSourceId: 'source',
      dateRangeFieldId: 'date',
      dimensions: [],
      metrics: [metric('median'), metric('standardDeviation'), metric('variance')],
      resultLimit: { mode: 'top' as const, amount: 20 },
    };
    const summary = tableSummary(definition, [
      { median: 10, standardDeviation: 10, variance: 10 },
      { median: 20, standardDeviation: 20, variance: 20 },
      { median: 100, standardDeviation: 30, variance: 30 },
    ]);
    expect(summary.median).toBe(20);
    expect(summary.standardDeviation).toBe(10);
    expect(summary.variance).toBe(100);
  });
});
