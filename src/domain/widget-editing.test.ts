import { describe, expect, it } from 'vitest';
import {
  clearControlValue,
  patchFilterCondition,
  type WidgetFilter,
} from '#/domain/widget-editing';
import { mergeControlState } from '#/domain/control-state';

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

  it('clears only the edited control value', () => {
    expect(
      clearControlValue({ values: { country: ['DE'], channel: ['Social'] } }, 'country'),
    ).toEqual({ values: { country: [], channel: ['Social'] } });
  });

  it('overrides a control default with an explicit empty value', () => {
    const cleared = clearControlValue({ values: { country: ['DE'] } }, 'country');

    expect(mergeControlState({ values: { country: ['DE'] } }, cleared)).toEqual({
      values: { country: [] },
    });
  });
});
