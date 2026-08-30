import { describe, expect, it } from 'vitest';
import { controlOptionsQuery } from './control-options';

describe('control option search', () => {
  it('puts an exact match before substring matches within the 100-row page', () => {
    const query = controlOptionsQuery('"Region"', 'z', 'ASC');
    expect(query.sql).toContain('CASE WHEN CAST("Region" AS VARCHAR) = ? THEN 0 ELSE 1 END');
    expect(query.sql).toContain('LIMIT 100');
    expect(query.parameters).toEqual(['%z%', 'z']);
  });
});
