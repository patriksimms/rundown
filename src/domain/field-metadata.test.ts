import { describe, expect, it } from 'vitest';
import { canUpdateFieldMetadata } from './field-metadata';

describe('field metadata permissions', () => {
  it('lets dashboard editors update visible metadata for a datasource their dashboard uses', () => {
    expect(
      canUpdateFieldMetadata(false, true, true, {
        label: 'Media cost',
        role: 'metric',
        semanticType: 'currency',
        defaultAggregation: 'sum',
        description: 'Net media cost',
      }),
    ).toBe(true);
  });

  it('keeps datasource ownership and admin-only metadata protected', () => {
    expect(canUpdateFieldMetadata(false, false, true, { label: 'Cost' })).toBe(false);
    expect(canUpdateFieldMetadata(false, true, false, { label: 'Cost' })).toBe(false);
    expect(canUpdateFieldMetadata(false, true, true, { hidden: true })).toBe(false);
    expect(canUpdateFieldMetadata(false, true, true, { castTo: 'VARCHAR' })).toBe(false);
    expect(canUpdateFieldMetadata(false, true, true, { canonicalName: 'cost' })).toBe(false);
    expect(canUpdateFieldMetadata(true, false, false, { hidden: true })).toBe(true);
  });
});
