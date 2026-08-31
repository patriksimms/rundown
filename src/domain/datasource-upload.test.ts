import { describe, expect, it } from 'vitest';
import {
  createDatasourceUploadCleanupToken,
  dataSourceLocationReferencesKey,
  datasourcePrefixOverlapsManagedUploads,
  datasourceNameFromFileName,
  datasourceUploadFormat,
  datasourceUploadKey,
  isManagedDatasourceUpload,
  MAX_DATASOURCE_FILE_BYTES,
  prepareDatasourceUploadSchema,
  verifyDatasourceUploadCleanupToken,
} from './datasource-upload';

describe('datasource uploads', () => {
  it('accepts one CSV or Parquet file up to 100 MB', () => {
    expect(
      prepareDatasourceUploadSchema.safeParse({
        fileName: 'Campaign export.CSV',
        fileSize: MAX_DATASOURCE_FILE_BYTES,
        format: 'csv',
      }).success,
    ).toBe(true);
    expect(
      prepareDatasourceUploadSchema.safeParse({
        fileName: 'report.parquet',
        fileSize: MAX_DATASOURCE_FILE_BYTES + 1,
        format: 'parquet',
      }).success,
    ).toBe(false);
    expect(
      prepareDatasourceUploadSchema.safeParse({
        fileName: 'report.csv.exe',
        fileSize: 10,
        format: 'csv',
      }).success,
    ).toBe(false);
  });

  it('derives the editable default name and format from the filename', () => {
    expect(datasourceNameFromFileName('weekly.report.parquet')).toBe('weekly.report');
    expect(datasourceUploadFormat('weekly.CSV')).toBe('csv');
    expect(datasourceUploadFormat('weekly.xlsx')).toBeUndefined();
  });

  it('creates collision-resistant keys inside the workspace upload prefix', () => {
    const key = datasourceUploadKey(
      'ws/acme/',
      'parquet',
      '147d4cd2-990c-4bb5-ab79-5d1f45ea53e5',
      new Date('2026-08-30T12:00:00Z'),
    );
    expect(key).toBe('ws/acme/uploads/2026-08-30/147d4cd2-990c-4bb5-ab79-5d1f45ea53e5.parquet');
    expect(isManagedDatasourceUpload('ws/acme/', key)).toBe(true);
    expect(isManagedDatasourceUpload('ws/other/', key)).toBe(false);
    expect(isManagedDatasourceUpload('ws/acme/', 'ws/acme/report.parquet')).toBe(false);
  });

  it('binds cleanup to the uploader, object, and a limited lifetime', async () => {
    const key = 'ws/acme/uploads/2026-08-30/147d4cd2-990c-4bb5-ab79-5d1f45ea53e5.parquet';
    const token = await createDatasourceUploadCleanupToken(key, 'user-a', 'secret', 1_000);

    expect(await verifyDatasourceUploadCleanupToken(token, key, 'user-a', 'secret', 1_100)).toBe(
      true,
    );
    expect(await verifyDatasourceUploadCleanupToken(token, key, 'user-b', 'secret', 1_100)).toBe(
      false,
    );
    expect(
      await verifyDatasourceUploadCleanupToken(
        token,
        key.replace('parquet', 'csv'),
        'user-a',
        'secret',
        1_100,
      ),
    ).toBe(false);
    expect(
      await verifyDatasourceUploadCleanupToken(token, key, 'user-a', 'secret', 1_000 + 86_401),
    ).toBe(false);
  });

  it('recognizes registered objects and prefixes that use an upload', () => {
    const key = 'ws/acme/uploads/2026-08-30/147d4cd2-990c-4bb5-ab79-5d1f45ea53e5.parquet';
    expect(dataSourceLocationReferencesKey({ kind: 'object', key, format: 'parquet' }, key)).toBe(
      true,
    );
    expect(
      dataSourceLocationReferencesKey(
        { kind: 'prefix', key: 'ws/acme/uploads/', format: 'parquet' },
        key,
      ),
    ).toBe(true);
    expect(
      dataSourceLocationReferencesKey(
        { kind: 'object', key: 'ws/acme/other.parquet', format: 'parquet' },
        key,
      ),
    ).toBe(false);
  });

  it('rejects every prefix namespace that can include managed uploads', () => {
    expect(datasourcePrefixOverlapsManagedUploads('ws/acme/', 'ws/acme/')).toBe(true);
    expect(datasourcePrefixOverlapsManagedUploads('ws/acme/', 'ws/acme/uploads/2026-08-30/')).toBe(
      true,
    );
    expect(datasourcePrefixOverlapsManagedUploads('ws/acme/', 'ws/acme/reports/')).toBe(false);
  });
});
