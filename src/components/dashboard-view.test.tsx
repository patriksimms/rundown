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
) {
  return renderToStaticMarkup(
    <Result
      definition={definition}
      rows={rows}
      comparisonRows={comparisonRows}
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
    expect(() => render(line, [{ month: 'Jan', metric_1: 10 }])).not.toThrow();
    expect(() =>
      render(
        {
          ...base,
          type: 'bar',
          metric,
          dimension: { fieldId: 'month' },
          breakdownDimension: { fieldId: 'channel' },
        },
        [{ month: 'Jan', channel: 'Search', metric_1: 10 }],
        [{ month: 'Dec', channel: 'Search', metric_1: 5 }],
      ),
    ).not.toThrow();
    expect(() =>
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
    ).not.toThrow();
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
    );
    expect(markup).toContain('Summary');
    expect(markup).toContain('Previous year');
    expect(markup).toContain('1–1');
    expect(render(definition, [])).toContain('0–0');
  });
});
