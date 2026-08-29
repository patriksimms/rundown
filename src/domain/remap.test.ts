import { describe, expect, it } from 'vitest';
import { remapWidgetDefinition } from './remap';

const source = {
  fields: [
    { id: 'source_date', canonicalName: 'date', columnName: 'DateStart' },
    { id: 'source_campaign', canonicalName: 'campaign', columnName: 'CampaignName' },
    { id: 'source_spend', canonicalName: 'spend', columnName: 'MediaCost' },
  ],
  calculatedFields: [],
};

describe('widget datasource remapping', () => {
  it('maps every referenced field by canonical name', () => {
    const definition = remapWidgetDefinition(
      {
        type: 'line',
        title: 'Spend by campaign',
        dataSourceId: 'source',
        dateRangeFieldId: 'source_date',
        dimension: { fieldId: 'source_campaign' },
        metrics: [
          {
            source: { kind: 'field', fieldId: 'source_spend', aggregation: 'sum' },
            dataType: 'currency',
          },
        ],
      },
      source,
      'target',
      {
        fields: [
          { id: 'target_date', canonicalName: 'date', columnName: 'day' },
          { id: 'target_campaign', canonicalName: 'campaign', columnName: 'campaign_name' },
          { id: 'target_spend', canonicalName: 'spend', columnName: 'media_cost' },
        ],
        calculatedFields: [],
      },
    );
    expect(definition).toMatchObject({
      dataSourceId: 'target',
      dateRangeFieldId: 'target_date',
      dimension: { fieldId: 'target_campaign' },
      metrics: [{ source: { fieldId: 'target_spend' } }],
    });
  });

  it('rewrites expression identifiers without changing user values', () => {
    const definition = remapWidgetDefinition(
      {
        type: 'scorecard',
        title: 'source_spend',
        dataSourceId: 'source',
        dateRangeFieldId: 'source_date',
        filter: {
          conditions: [{ fieldId: 'source_campaign', operator: 'equals', value: 'source_spend' }],
          connector: 'and',
        },
        metric: {
          source: {
            kind: 'expression',
            expression: `SUM("MediaCost") + SUM(MediaCost) + COUNT('MediaCost')`,
          },
          dataType: 'currency',
        },
      },
      source,
      'target',
      {
        fields: [
          { id: 'target_date', canonicalName: 'date', columnName: 'day' },
          { id: 'target_campaign', canonicalName: 'campaign', columnName: 'campaign_name' },
          { id: 'target_spend', canonicalName: 'spend', columnName: 'media_cost' },
        ],
        calculatedFields: [],
      },
    );
    if (definition.type !== 'scorecard') throw new Error('Expected a scorecard.');
    expect(definition.title).toBe('source_spend');
    expect(definition.filter?.conditions[0]?.value).toBe('source_spend');
    expect(definition.metric.source).toEqual({
      kind: 'expression',
      expression: `SUM("media_cost") + SUM("media_cost") + COUNT('MediaCost')`,
    });
  });

  it('rejects a target missing a referenced canonical field', () => {
    expect(() =>
      remapWidgetDefinition(
        {
          type: 'scorecard',
          title: 'Spend',
          dataSourceId: 'source',
          dateRangeFieldId: 'source_date',
          metric: {
            source: { kind: 'field', fieldId: 'source_spend', aggregation: 'sum' },
            dataType: 'currency',
          },
        },
        source,
        'target',
        {
          fields: [{ id: 'target_date', canonicalName: 'date', columnName: 'day' }],
          calculatedFields: [],
        },
      ),
    ).toThrow('source_spend');
  });
});
