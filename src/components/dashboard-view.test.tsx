import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DashboardWidget } from '#/domain/schema';
import { Result } from './dashboard-view';

type QueryDefinition = Extract<DashboardWidget['definition'], { title: string }>;
const base = {
  title: 'Result',
  dataSourceId: 'source',
  dateRangeFieldId: 'date',
};
const metric = {
  source: { kind: 'field' as const, fieldId: 'value', aggregation: 'sum' as const },
  dataType: 'number' as const,
};

function render(
  definition: QueryDefinition,
  rows: Record<string, unknown>[],
  comparisonRows?: Record<string, unknown>[],
  summaryRow?: Record<string, unknown>,
) {
  return renderToStaticMarkup(
    <Result
      definition={definition}
      rows={rows}
      comparisonRows={comparisonRows}
      summaryRow={summaryRow}
      page={0}
      hasMore={false}
      setPage={() => {}}
    />,
  );
}

describe('widget result rendering', () => {
  it('renders scorecard and library-limited gauge values', () => {
    expect(render({ ...base, type: 'scorecard', metric }, [{ metric_1: 42 }])).toContain('42');
    expect(
      render(
        {
          ...base,
          type: 'gauge',
          metric,
          upperLimit: { kind: 'library', libraryMetricId: 'limit' },
        },
        [{ metric_1: 25, upper_limit: 100 }],
      ),
    ).toContain('25 of 100');
  });

  it('renders empty and one-row chart states for line, bar, and pie', () => {
    const line = {
      ...base,
      type: 'line' as const,
      dimension: { fieldId: 'month' },
      metrics: [metric],
    };
    expect(render(line, [])).toContain('No rows');
    expect(render(line, [{ month: 'Jan', metric_1: 10 }])).toContain('--color-chart_series_0');
    const previousOnly = render(line, [], [{ month: 'Jan', metric_1: 5 }]);
    expect(previousOnly).not.toContain('No rows');
    expect(previousOnly).toContain('--color-chart_series_1');
    const barMarkup = render(
      {
        ...base,
        type: 'bar',
        metric,
        dimension: { fieldId: 'month' },
        breakdownDimension: { fieldId: 'channel' },
      },
      [{ month: 'Jan', channel: 'Paid Search', metric_1: 10 }],
      [{ month: 'Jan', channel: 'Organic Social', metric_1: 5 }],
    );
    expect(barMarkup).toContain('--color-chart_series_0');
    expect(barMarkup).toContain('--color-chart_series_1');
    expect(barMarkup).toContain('--color-chart_series_3');
    expect(barMarkup).not.toContain('--color-Paid Search');
    expect(
      render(
        {
          ...base,
          type: 'pie',
          metric,
          dimension: { fieldId: 'month' },
          breakdownDimension: { fieldId: 'channel' },
        },
        [{ month: 'Jan', channel: 'Search', metric_1: 10 }],
      ),
    ).toContain('--color-chart_series_0');
  });

  it('renders current and previous mixed-unit series', () => {
    const markup = render(
      {
        ...base,
        type: 'line',
        dimension: { fieldId: 'day' },
        metrics: [metric, { ...metric, dataType: 'percent' }],
      },
      [{ day: '2026-01-02', metric_1: 10, metric_2: 0.2 }],
      [{ day: '2026-01-02', metric_1: 8, metric_2: 0.1 }],
    );
    expect(markup).toContain('--color-chart_series_1');
    expect(markup).toContain('--color-chart_series_2');
    expect(markup).toContain('--color-chart_series_3');
  });

  it('renders table summary, comparison label, and empty range', () => {
    const definition: QueryDefinition = {
      ...base,
      type: 'table',
      dimensions: [{ fieldId: 'month' }],
      metrics: [metric],
      resultLimit: { mode: 'pagination', amount: 20 },
      showSummaryRow: true,
      comparison: { mode: 'previousYear' },
    };
    const markup = render(
      definition,
      [{ month: 'Jan', metric_1: 10 }],
      [{ month: 'Jan', metric_1: 5 }],
      { month: 'Summary', metric_1: 10 },
    );
    expect(markup).toContain('Summary');
    expect(markup).toContain('Previous year');
    expect(markup).toContain('1–1');
    expect(render(definition, [])).toContain('0–0');
  });
});
