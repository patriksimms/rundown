import { describe, expect, it } from 'vitest';
import {
  datasourceOverviewRows,
  formatRelativeTime,
  type DatasourceListEntry,
} from './datasource-overview';

const entries: DatasourceListEntry[] = [
  {
    id: 'ds_1',
    name: 'Campaign report',
    location: { kind: 'object', key: 'ws/a/report.csv', format: 'csv' },
    fieldCount: 12,
    updatedAt: '2026-08-01T10:00:00.000Z',
  },
  {
    id: 'ds_2',
    name: 'Daily spend',
    location: { kind: 'prefix', key: 'ws/a/daily/', format: 'parquet' },
    fieldCount: 0,
    updatedAt: '2026-08-20T10:00:00.000Z',
  },
];

describe('datasource overview rows', () => {
  it('labels source type and format for humans', () => {
    expect(datasourceOverviewRows(entries)).toEqual([
      {
        id: 'ds_1',
        name: 'Campaign report',
        sourceType: 'Single object',
        format: 'CSV',
        fieldCount: 12,
        updatedAt: '2026-08-01T10:00:00.000Z',
      },
      {
        id: 'ds_2',
        name: 'Daily spend',
        sourceType: 'Partition prefix',
        format: 'Parquet',
        fieldCount: 0,
        updatedAt: '2026-08-20T10:00:00.000Z',
      },
    ]);
  });

  it('keeps a datasource without fields in the overview', () => {
    expect(datasourceOverviewRows(entries).map((row) => row.fieldCount)).toEqual([12, 0]);
  });
});

describe('relative update times', () => {
  const now = new Date('2026-08-31T12:00:00.000Z');

  it('picks the coarsest unit that fits the elapsed time', () => {
    expect(formatRelativeTime('2026-08-31T11:30:00.000Z', now)).toBe('30 minutes ago');
    expect(formatRelativeTime('2026-08-29T12:00:00.000Z', now)).toBe('2 days ago');
    expect(formatRelativeTime('2026-06-30T12:00:00.000Z', now)).toBe('2 months ago');
  });

  it('collapses anything under a minute to today', () => {
    expect(formatRelativeTime('2026-08-31T11:59:30.000Z', now)).toBe('today');
  });

  it('returns nothing for an unparseable timestamp', () => {
    expect(formatRelativeTime('not a date', now)).toBe('');
  });
});
