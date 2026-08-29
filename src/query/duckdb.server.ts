import { env } from 'cloudflare:workers';
import { compileSourceSql } from './compiler';
import type { QueryEngineRequest, QueryEngineResponse } from './engine-contract';
import type { DataSourceRecord } from './types';

export async function runIsolatedPreparedQuery<T extends Record<string, unknown>>(
  dataSource: DataSourceRecord,
  bucketName: string,
  compile: (sourceTableName: string) => { sql: string; parameters: unknown[] },
) {
  const query = compile('rundown_source');
  return queryEngineRequest<T[]>({
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
  return queryEngineRequest<Record<string, unknown>[]>({
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
  }>({
    operation: 'describeSource',
    sourceSql: compileSourceSql(dataSource, bucketName),
  });
}

async function queryEngineRequest<T>(body: QueryEngineRequest) {
  const response = await env.QUERY_ENGINE.fetch(
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
