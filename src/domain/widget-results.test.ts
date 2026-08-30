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
    ).toEqual([{ month: 'Jan', spend: 20, 'Previous spend': 10 }]);
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
});
