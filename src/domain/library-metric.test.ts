import { describe, expect, it } from 'vitest';
import { canonicalMetricExpression } from './library-metric';

describe('canonical library metric expressions', () => {
  const fields = [
    { canonicalName: 'spend', columnName: 'MediaCost' },
    { canonicalName: 'impressions', columnName: 'Impressions' },
  ];

  it('replaces datasource column names with canonical field names', () => {
    expect(canonicalMetricExpression('SUM("MediaCost") / SUM(Impressions)', fields)).toBe(
      'SUM("spend") / SUM("impressions")',
    );
  });

  it('preserves SQL syntax and string literals', () => {
    expect(
      canonicalMetricExpression(
        `CASE WHEN Impressions > 0 THEN "MediaCost" ELSE 'MediaCost' END`,
        fields,
      ),
    ).toBe(`CASE WHEN "impressions" > 0 THEN "spend" ELSE 'MediaCost' END`);
  });

  it('rejects ambiguous datasource identifiers', () => {
    expect(() =>
      canonicalMetricExpression('cost', [
        { canonicalName: 'spend', columnName: 'cost' },
        { canonicalName: 'revenue', columnName: 'cost' },
      ]),
    ).toThrow('Ambiguous datasource field identifier: cost');
  });
});
