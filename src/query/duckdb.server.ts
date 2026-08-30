import { env } from 'cloudflare:workers';
import { resolveDataSource } from '#/data/source.server';
import type { QueryEngineRequest, QueryEngineResponse } from './engine-contract';
import type { DataSourceRecord } from './types';

export async function runIsolatedPreparedQuery<T extends Record<string, unknown>>(
  dataSource: DataSourceRecord,
  compile: (sourceTableName: string) => { sql: string; parameters: unknown[] },
) {
  const query = compile('rundown_source');
  const source = await resolveDataSource(dataSource);
  return queryEngineRequest<T[]>({
    operation: 'isolatedQuery',
    sourceSql: source.sql,
    requiresR2Credentials: source.requiresR2Credentials,
    sql: query.sql,
    parameters: query.parameters,
  });
}

export async function explainIsolatedQuery(
  dataSource: DataSourceRecord,
  sql: string,
  parameters: unknown[] = [],
) {
  const source = await resolveDataSource(dataSource);
  return queryEngineRequest<Record<string, unknown>[]>({
    operation: 'isolatedQuery',
    sourceSql: source.sql,
    requiresR2Credentials: source.requiresR2Credentials,
    sql: `EXPLAIN ${sql}`,
    parameters,
  });
}

export async function describeDataSource(dataSource: DataSourceRecord) {
  const source = await resolveDataSource(dataSource);
  return queryEngineRequest<{
    description: Array<{ column_name: string; column_type: string }>;
    samples: Record<string, unknown>[];
  }>({
    operation: 'describeSource',
    sourceSql: source.sql,
    requiresR2Credentials: source.requiresR2Credentials,
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
