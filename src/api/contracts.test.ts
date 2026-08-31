import { describe, expect, it } from 'vitest';
import { apiRequestSchema } from './contracts';

describe('datasource upload API contracts', () => {
  it('keeps filename and format validation in the action union', () => {
    expect(
      apiRequestSchema.safeParse({
        action: 'prepareDatasourceUpload',
        fileName: 'report.csv',
        fileSize: 1,
        format: 'csv',
      }).success,
    ).toBe(true);
    expect(
      apiRequestSchema.safeParse({
        action: 'prepareDatasourceUpload',
        fileName: 'report.parquet',
        fileSize: 1,
        format: 'csv',
      }).success,
    ).toBe(false);
  });
});
