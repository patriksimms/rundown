import { describe, expect, it } from 'vitest';
import { defaultDateRange, type DashboardDocument } from '#/domain/schema';
import { assertSingleExpression, compileLibraryExpression, compileWidgetQuery } from './compiler';
import type { DataSourceRecord, FieldRecord } from './types';

const dataSource: DataSourceRecord = {
  id: 'source',
  workspaceId: 'workspace',
  name: 'Report',
  location: { kind: 'object', key: 'ws/workspace/report.csv', format: 'csv' },
  version: 'v1',
};
const fields: FieldRecord[] = [
  {
    id: 'date',
    dataSourceId: 'source',
    columnName: 'DateStart',
    canonicalName: 'date',
    label: 'Date',
    role: 'date',
    semanticType: 'date',
    description: null,
    hidden: false,
    castTo: null,
    sampleValues: null,
    cardinality: null,
  },
  {
    id: 'campaign',
    dataSourceId: 'source',
    columnName: 'Campaign',
    canonicalName: 'campaign',
    label: 'Campaign',
    role: 'dimension',
    semanticType: 'text',
    description: null,
    hidden: false,
    castTo: null,
    sampleValues: null,
    cardinality: null,
  },
  {
    id: 'cost',
    dataSourceId: 'source',
    columnName: 'MediaCost',
    canonicalName: 'media_cost',
    label: 'Cost',
    role: 'metric',
    semanticType: 'currency',
    description: null,
    hidden: false,
    castTo: null,
    sampleValues: null,
    cardinality: null,
  },
];
const dashboard: DashboardDocument = {
  id: 'dashboard',
  workspaceId: 'workspace',
  name: 'Test',
  schemaVersion: 2,
  timezone: 'Europe/Berlin',
  defaultDateRange,
  columns: 12,
  widgets: [],
  createdBy: 'user',
  createdAt: '2026-08-29T00:00:00.000Z',
  updatedAt: '2026-08-29T00:00:00.000Z',
};

describe('query compiler', () => {
  it('compiles stored fields, controls, aggregation, ordering, and limits against the isolated table', () => {
    const result = compileWidgetQuery({
      dashboard,
      definition: {
        type: 'table',
        title: 'Cost',
        dataSourceId: 'source',
        dateRangeFieldId: 'date',
        dimensions: [{ fieldId: 'campaign' }],
        metrics: [
          { source: { kind: 'field', fieldId: 'cost', aggregation: 'sum' }, dataType: 'currency' },
        ],
        resultLimit: { mode: 'top', amount: 20 },
        sort: [{ target: { kind: 'metric', index: 0 }, direction: 'desc' }],
      },
      dataSource,
      fields,
      calculatedFields: [],
      libraryMetrics: [],
      controlState: {},
      bucketName: 'bucket',
      sourceTableName: 'rundown_source',
      resolvedControls: [{ fieldId: 'campaign', values: ['Alpha'] }],
    });
    expect(result.sql).toContain('FROM "rundown_source"');
    expect(result.sql).toContain('"Campaign" IN (?)');
    expect(result.sql).toContain('GROUP BY 1 ORDER BY 2 DESC LIMIT 20');
    expect(result.parameters.at(-1)).toBe('Alpha');
  });

  it('rewrites canonical library fields to raw datasource columns', () => {
    expect(compileLibraryExpression('SUM(media_cost)', { fields, calculatedFields: [] })).toBe(
      'SUM("MediaCost")',
    );
  });

  it('does not rewrite canonical names inside SQL string literals', () => {
    const paid = {
      ...fields[0],
      id: 'paid',
      canonicalName: 'paid',
      columnName: 'Paid',
    };
    expect(
      compileLibraryExpression(`SUM(CASE WHEN campaign = 'paid' THEN media_cost ELSE 0 END)`, {
        fields: [...fields, paid],
        calculatedFields: [],
      }),
    ).toBe(`SUM(CASE WHEN "Campaign" = 'paid' THEN "MediaCost" ELSE 0 END)`);
  });

  it('rewrites quoted canonical identifiers without double quoting them', () => {
    expect(compileLibraryExpression('SUM("media_cost")', { fields, calculatedFields: [] })).toBe(
      'SUM("MediaCost")',
    );
  });

  it('prefers a raw field when a calculated field has the same canonical name', () => {
    expect(
      compileLibraryExpression('SUM(media_cost)', {
        fields,
        calculatedFields: [
          {
            id: 'calculated-cost',
            dataSourceId: 'source',
            canonicalName: 'media_cost',
            label: 'Calculated cost',
            expression: 'MediaCost * 2',
            role: 'metric',
            semanticType: 'currency',
            description: null,
          },
        ],
      }),
    ).toBe('SUM("MediaCost")');
  });

  it('uses the raw field for a stored library metric with a colliding calculated name', () => {
    const result = compileWidgetQuery({
      dashboard,
      definition: {
        type: 'scorecard',
        title: 'Cost',
        dataSourceId: 'source',
        dateRangeFieldId: 'date',
        metric: {
          source: { kind: 'library', libraryMetricId: 'metric' },
          dataType: 'currency',
        },
      },
      dataSource,
      fields,
      calculatedFields: [
        {
          id: 'calculated-cost',
          dataSourceId: 'source',
          canonicalName: 'media_cost',
          label: 'Calculated cost',
          expression: 'MediaCost * 2',
          role: 'metric',
          semanticType: 'currency',
          description: null,
        },
      ],
      libraryMetrics: [
        {
          id: 'metric',
          name: 'Cost',
          canonicalName: 'cost',
          expression: 'SUM(media_cost)',
          semanticType: 'currency',
          description: null,
        },
      ],
      controlState: {},
      bucketName: 'bucket',
      sourceTableName: 'rundown_source',
    });
    expect(result.sql).toContain('SELECT SUM("MediaCost") AS "metric_1"');
  });

  it('rejects a top-level alias while allowing aliases inside string literals', () => {
    expect(() =>
      compileLibraryExpression('SUM(media_cost) AS total', { fields, calculatedFields: [] }),
    ).toThrow(/one SQL expression/u);
    expect(() =>
      compileLibraryExpression(`SUM(CASE WHEN campaign = 'AS' THEN media_cost ELSE 0 END)`, {
        fields,
        calculatedFields: [],
      }),
    ).not.toThrow();
    expect(() =>
      compileLibraryExpression('SUM(CAST(media_cost AS DOUBLE))', {
        fields,
        calculatedFields: [],
      }),
    ).not.toThrow();
  });

  it('rejects statement separators and SQL comments in expressions', () => {
    expect(() => assertSingleExpression('SUM(cost); SELECT 1')).toThrow(/one SQL expression/u);
    expect(() => assertSingleExpression('SUM(cost) -- ignore')).toThrow(/one SQL expression/u);
  });
});
