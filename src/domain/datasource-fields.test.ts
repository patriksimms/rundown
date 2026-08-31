import { describe, expect, it } from 'vitest';
import { datasourceFieldRows, type DatasourceDescription } from './datasource-fields';

const description: DatasourceDescription = {
  id: 'ds_1',
  name: 'Campaign report',
  fields: [
    {
      id: 'shared',
      columnName: 'DateStart',
      canonicalName: 'date_start',
      label: 'Date start',
      role: 'dimension',
      semanticType: 'date',
      defaultAggregation: null,
      description: null,
    },
  ],
  calculatedFields: [
    {
      id: 'shared',
      canonicalName: 'cost_per_click',
      label: 'Cost per click',
      expression: 'spend / clicks',
      role: 'metric',
      semanticType: 'currency',
      defaultAggregation: 'sum',
      description: 'Blended CPC',
    },
  ],
  libraryMetrics: [
    {
      id: 'metric_1',
      name: 'Click-through rate',
      canonicalName: 'ctr',
      expression: 'SUM(clicks) / SUM(impressions)',
      semanticType: 'ratio',
      description: null,
    },
  ],
};

describe('datasource field rows', () => {
  it('lists raw fields, calculated fields, and library metrics together', () => {
    expect(datasourceFieldRows(description).map((row) => [row.origin, row.canonicalName])).toEqual([
      ['raw', 'date_start'],
      ['calculated', 'cost_per_click'],
      ['library', 'ctr'],
    ]);
  });

  it('keeps keys unique when a raw and a calculated field share an id', () => {
    const keys = datasourceFieldRows(description).map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('treats library metrics as read-only metrics', () => {
    const metric = datasourceFieldRows(description).find((row) => row.origin === 'library');
    expect(metric).toMatchObject({
      role: 'metric',
      editable: false,
      label: 'Click-through rate',
      expression: 'SUM(clicks) / SUM(impressions)',
    });
  });

  it('exposes the raw column name so metadata patches can target it', () => {
    const [raw, calculated] = datasourceFieldRows(description);
    expect(raw).toMatchObject({ columnName: 'DateStart', editable: true });
    expect(calculated.columnName).toBeUndefined();
    expect(calculated.editable).toBe(true);
  });

  it('renders a missing description as an empty string', () => {
    expect(datasourceFieldRows(description).map((row) => row.description)).toEqual([
      '',
      'Blended CPC',
      '',
    ]);
  });
});
