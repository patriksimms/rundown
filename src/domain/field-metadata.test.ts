import { describe, expect, it } from 'vitest';
import { canUpdateFieldMetadata, detectFieldSemantics } from './field-metadata';
import { fieldRoleSchema } from './schema';

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

describe('field auto-detection', () => {
  it('keeps id and date columns as dimensions while preserving their semantic type', () => {
    expect(detectFieldSemantics('AccountId', 'BIGINT')).toEqual({
      role: 'dimension',
      semanticType: 'id',
      defaultAggregation: 'sum',
      castTo: 'VARCHAR',
    });
    expect(detectFieldSemantics('DateStart', 'TIMESTAMP')).toEqual({
      role: 'dimension',
      semanticType: 'date',
      defaultAggregation: null,
      castTo: null,
    });
  });

  it('makes plain numeric columns metrics and everything else a dimension', () => {
    expect(detectFieldSemantics('Spend', 'DOUBLE')).toMatchObject({
      role: 'metric',
      semanticType: 'count',
      defaultAggregation: 'sum',
    });
    expect(detectFieldSemantics('Campaign', 'VARCHAR')).toMatchObject({
      role: 'dimension',
      semanticType: 'text',
      defaultAggregation: null,
    });
  });
});

describe('field roles', () => {
  it('offers dimension and metric only', () => {
    // Every role selector renders these options. A hardcoded list that drifted
    // from this set would offer roles the API rejects.
    expect(fieldRoleSchema.options).toEqual(['dimension', 'metric']);
  });
});
