import { describe, expect, it } from 'vitest';
import { remapWidgetDefinition } from './remap';

const source = {
  fields: [
    { id: 'source_date', canonicalName: 'date' },
    { id: 'source_campaign', canonicalName: 'campaign' },
    { id: 'source_spend', canonicalName: 'spend' },
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
          { id: 'target_date', canonicalName: 'date' },
          { id: 'target_campaign', canonicalName: 'campaign' },
          { id: 'target_spend', canonicalName: 'spend' },
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
          fields: [{ id: 'target_date', canonicalName: 'date' }],
          calculatedFields: [],
        },
      ),
    ).toThrow('source_spend');
  });
});
