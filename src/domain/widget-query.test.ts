import { describe, expect, it } from 'vitest';
import { widgetQueryRequest } from '#/domain/widget-query';
import type { DashboardWidget } from '#/domain/schema';

const widget: DashboardWidget = {
  id: 'widget-1',
  definition: {
    type: 'scorecard',
    title: 'Spend',
    dataSourceId: 'source-1',
    dateRangeFieldId: 'date',
    metric: {
      source: { kind: 'field', fieldId: 'spend', aggregation: 'sum' },
      dataType: 'currency',
    },
  },
  layout: { x: 0, y: 0, width: 4, height: 3 },
  definitionHash: 'hash-1',
};

describe('widget query requests', () => {
  it('queries an optimistic definition directly while editing', () => {
    const edited = {
      ...widget,
      definition: {
        ...widget.definition,
        metric: {
          source: { kind: 'field' as const, fieldId: 'revenue', aggregation: 'average' as const },
          dataType: 'currency' as const,
        },
      },
    };

    expect(
      widgetQueryRequest({
        dashboardId: 'dashboard-1',
        widget: edited,
        controlState: {},
        preview: true,
      }),
    ).toMatchObject({
      action: 'previewWidget',
      definition: { metric: { source: { fieldId: 'revenue', aggregation: 'average' } } },
    });
  });

  it('queries the persisted widget outside the editor', () => {
    expect(
      widgetQueryRequest({
        dashboardId: 'dashboard-1',
        widget,
        controlState: {},
        preview: false,
      }),
    ).toEqual({
      action: 'queryWidget',
      dashboardId: 'dashboard-1',
      widgetId: 'widget-1',
      shareToken: undefined,
      controlState: {},
    });
  });
});
