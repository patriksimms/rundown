import { describe, expect, it } from 'vitest';
import { hashJson } from './hash';
import { widgetDependencyState } from './cache';

const definition = {
  type: 'scorecard' as const,
  title: 'Spend',
  dataSourceId: 'source',
  dateRangeFieldId: 'date',
  metric: {
    source: { kind: 'library' as const, libraryMetricId: 'metric_spend' },
    dataType: 'currency' as const,
  },
};

describe('widget dependency cache state', () => {
  it('changes when a calculated field used by a library metric changes', async () => {
    const metadata = {
      calculatedFields: [{ id: 'calc_cost', expression: 'cost * 1.2', updatedAt: 'one' }],
      libraryMetrics: [{ id: 'metric_spend', expression: 'SUM(cost)', updatedAt: 'one' }],
    };
    const before = await hashJson(widgetDependencyState(definition, metadata));
    const after = await hashJson(
      widgetDependencyState(definition, {
        ...metadata,
        calculatedFields: [{ ...metadata.calculatedFields[0], expression: 'cost * 1.3' }],
      }),
    );
    expect(after).not.toBe(before);
  });

  it('changes for referenced metrics but ignores unrelated metric edits', async () => {
    const metadata = {
      calculatedFields: [],
      libraryMetrics: [
        { id: 'metric_spend', expression: 'SUM(cost)', updatedAt: 'one' },
        { id: 'metric_clicks', expression: 'SUM(clicks)', updatedAt: 'one' },
      ],
    };
    const before = await hashJson(widgetDependencyState(definition, metadata));
    const relevant = await hashJson(
      widgetDependencyState(definition, {
        ...metadata,
        libraryMetrics: [
          { ...metadata.libraryMetrics[0], expression: 'SUM(cost) * 1.2' },
          metadata.libraryMetrics[1],
        ],
      }),
    );
    const unrelated = await hashJson(
      widgetDependencyState(definition, {
        ...metadata,
        libraryMetrics: [
          metadata.libraryMetrics[0],
          { ...metadata.libraryMetrics[1], expression: 'SUM(clicks) * 2' },
        ],
      }),
    );
    expect(relevant).not.toBe(before);
    expect(unrelated).toBe(before);
  });
});
