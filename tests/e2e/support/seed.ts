import { expect, type Page } from '@playwright/test';

interface ApiEnvelope {
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string };
}

export interface SeededField {
  id: string;
  columnName: string;
  role: string;
}

export interface SeededDataSource {
  id: string;
  name: string;
  fields: SeededField[];
}

const reportCsv = [
  'region,day,revenue',
  'north,2026-01-05,120',
  'south,2026-01-06,80',
  'north,2026-01-07,200',
  'south,2026-01-08,45',
  '',
].join('\n');

/** Calls the API with the signed-in browser context, so tenancy is resolved the real way. */
export async function callApi<T>(page: Page, body: Record<string, unknown>): Promise<T> {
  const response = await page.request.post('/api/rundown', { data: body });
  const envelope = (await response.json()) as ApiEnvelope;
  if (!envelope.ok)
    throw new Error(
      `${String(body.action)} failed with ${envelope.error?.code}: ${envelope.error?.message}`,
    );
  return envelope.data as T;
}

/** Uploads a small CSV through the real upload path and registers it as a datasource. */
export async function seedDataSource(page: Page, name: string): Promise<SeededDataSource> {
  const contents = Buffer.from(reportCsv, 'utf8');
  const upload = await callApi<{ key: string; uploadUrl: string; cleanupToken: string }>(page, {
    action: 'prepareDatasourceUpload',
    fileName: `${name}.csv`,
    fileSize: contents.byteLength,
    format: 'csv',
  });
  const stored = await page.request.put(upload.uploadUrl, {
    data: contents,
    headers: { 'content-type': 'text/csv' },
  });
  expect(stored.ok(), `uploading ${upload.key} failed with HTTP ${stored.status()}`).toBe(true);

  return callApi<SeededDataSource>(page, {
    action: 'registerDatasource',
    name,
    location: { kind: 'object', key: upload.key, format: 'csv' },
    cleanupToken: upload.cleanupToken,
  });
}

export function fieldId(source: SeededDataSource, columnName: string) {
  const field = source.fields.find((entry) => entry.columnName === columnName);
  if (!field) throw new Error(`Seeded datasource has no "${columnName}" column.`);
  return field.id;
}

/** Creates a dashboard with a scorecard and a filter control over the seeded datasource. */
export async function seedDashboard(page: Page, name: string, source: SeededDataSource) {
  const dashboard = await callApi<{ id: string }>(page, {
    action: 'createDashboard',
    name,
    dataSourceIds: [source.id],
    timezone: 'Europe/Berlin',
    defaultDateRange: { startDate: { fixed: '2026-01-01' }, endDate: { fixed: '2026-01-31' } },
  });
  await callApi(page, {
    action: 'addWidget',
    dashboardId: dashboard.id,
    definition: {
      type: 'scorecard',
      title: 'Revenue',
      dataSourceId: source.id,
      dateRangeFieldId: fieldId(source, 'day'),
      metric: {
        source: { kind: 'field', fieldId: fieldId(source, 'revenue'), aggregation: 'sum' },
        dataType: 'number',
      },
    },
    width: 4,
    height: 3,
  });
  await callApi(page, {
    action: 'addWidget',
    dashboardId: dashboard.id,
    definition: {
      type: 'control',
      dataSourceId: source.id,
      fieldId: fieldId(source, 'region'),
      userDefinedName: 'Region',
      allowMultiple: true,
    },
    width: 4,
    height: 2,
  });
  return dashboard;
}
