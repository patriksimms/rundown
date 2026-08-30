import { describe, expect, it } from 'vitest';
import { patchFilterCondition, type WidgetFilter } from '#/domain/widget-editing';

describe('widget filter editing', () => {
  it('preserves untouched conditions and the connector', () => {
    const filter: WidgetFilter = {
      connector: 'or',
      conditions: [
        { fieldId: 'country', operator: 'equals', value: 'DE' },
        { fieldId: 'spend', operator: 'greaterThan', value: 100 },
      ],
    };

    expect(patchFilterCondition(filter, 0, { value: 'FR' })).toEqual({
      connector: 'or',
      conditions: [
        { fieldId: 'country', operator: 'equals', value: 'FR' },
        { fieldId: 'spend', operator: 'greaterThan', value: 100 },
      ],
    });
  });
});
