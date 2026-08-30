import { z } from 'zod';

export const MAX_DATASOURCE_FILE_BYTES = 100_000_000;
export const datasourceUploadFormatSchema = z.enum(['csv', 'parquet']);

export const prepareDatasourceUploadSchema = z
  .object({
    fileName: z.string().trim().min(1),
    fileSize: z.number().int().positive().max(MAX_DATASOURCE_FILE_BYTES),
    format: datasourceUploadFormatSchema,
  })
  .superRefine(({ fileName, format }, context) => {
    if (datasourceUploadFormat(fileName) !== format)
      context.addIssue({
        code: 'custom',
        path: ['fileName'],
        message: 'Choose a CSV or Parquet file.',
      });
  });

export const datasourceUploadEventSchema = z.object({
  event: z.enum([
    'started',
    'cancelled',
    'failed',
    'completed',
    'inspection_failed',
    'file_removed',
    'datasource_registered',
  ]),
  fileSize: z.number().int().nonnegative().max(MAX_DATASOURCE_FILE_BYTES),
  format: datasourceUploadFormatSchema,
  durationMs: z.number().int().nonnegative(),
});

export type DatasourceUploadFormat = z.infer<typeof datasourceUploadFormatSchema>;
export type DatasourceUploadEvent = z.infer<typeof datasourceUploadEventSchema>;

export function datasourceUploadFormat(fileName: string): DatasourceUploadFormat | undefined {
  const extension = fileName.split('.').pop()?.toLocaleLowerCase('en-US');
  return extension === 'csv' || extension === 'parquet' ? extension : undefined;
}

export function datasourceNameFromFileName(fileName: string) {
  return fileName.replace(/\.(csv|parquet)$/iu, '');
}

export function datasourceUploadKey(
  workspacePrefix: string,
  format: DatasourceUploadFormat,
  id: string = crypto.randomUUID(),
  date = new Date(),
) {
  return `${workspacePrefix}uploads/${date.toISOString().slice(0, 10)}/${id}.${format}`;
}

export function isManagedDatasourceUpload(workspacePrefix: string, key: string) {
  if (!key.startsWith(`${workspacePrefix}uploads/`) || key.includes('..')) return false;
  const relativeKey = key.slice(`${workspacePrefix}uploads/`.length);
  return /^\d{4}-\d{2}-\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(csv|parquet)$/iu.test(
    relativeKey,
  );
}
