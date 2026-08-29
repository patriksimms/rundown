import { getContainer } from '@cloudflare/containers';
import { env } from 'cloudflare:workers';
import { compileSourceSql } from './compiler';
import type { DataSourceRecord } from './types';

type QueryEngineResponse<T> = { ok: true; data: T } | { ok: false; error: string };

export async function runIsolatedPreparedQuery<T extends Record<string, unknown>>(
  dataSource: DataSourceRecord,
  bucketName: string,
  compile: (sourceTableName: string) => { sql: string; parameters: unknown[] },
) {
  const query = compile('rundown_source');
  return queryEngineRequest<T[]>(dataSource.workspaceId, {
    operation: 'isolatedQuery',
    sourceSql: compileSourceSql(dataSource, bucketName),
    sql: query.sql,
    parameters: query.parameters,
  });
}

export async function explainIsolatedQuery(
  dataSource: DataSourceRecord,
  bucketName: string,
  sql: string,
  parameters: unknown[] = [],
) {
  return queryEngineRequest<Record<string, unknown>[]>(dataSource.workspaceId, {
    operation: 'isolatedQuery',
    sourceSql: compileSourceSql(dataSource, bucketName),
    sql: `EXPLAIN ${sql}`,
    parameters,
  });
}

export async function describeDataSource(dataSource: DataSourceRecord, bucketName: string) {
  return queryEngineRequest<{
    description: Array<{ column_name: string; column_type: string }>;
    samples: Record<string, unknown>[];
  }>(dataSource.workspaceId, {
    operation: 'describeSource',
    sourceSql: compileSourceSql(dataSource, bucketName),
  });
}

async function queryEngineRequest<T>(workspaceId: string, body: Record<string, unknown>) {
  const response = await getContainer(env.QUERY_ENGINE, workspaceId).fetch(
    new Request('http://query-engine/query', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  const result = (await response.json()) as QueryEngineResponse<T>;
  if (!response.ok || !result.ok)
    throw new Error(result.ok ? `Query engine returned HTTP ${response.status}.` : result.error);
  return result.data;
}
