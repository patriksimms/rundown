import { getContainer } from '@cloudflare/containers';
import { env } from 'cloudflare:workers';
import { resolveDataSource } from '#/data/source.server';
import type { QueryEngineRequest, QueryEngineResponse } from './engine-contract';
import type { DataSourceRecord } from './types';
import { ApiError } from '#/server/errors';
import { safeQueryMessage } from './errors';

export async function runIsolatedPreparedQuery<T extends Record<string, unknown>>(
  dataSource: DataSourceRecord,
  compile: (sourceTableName: string) => { sql: string; parameters: unknown[] },
) {
  const query = compile('rundown_source');
  const source = await resolveDataSource(dataSource);
  return queryEngineRequest<T[]>(dataSource.workspaceId, {
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
  return queryEngineRequest<Record<string, unknown>[]>(dataSource.workspaceId, {
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
  }>(dataSource.workspaceId, {
    operation: 'describeSource',
    sourceSql: source.sql,
    requiresR2Credentials: source.requiresR2Credentials,
  });
}

async function queryEngineRequest<T>(workspaceId: string, body: QueryEngineRequest) {
  const local = !env.DATA_SOURCE_BASE_URL.startsWith('r2://');
  const request = new Request(
    local ? new URL('/__query-engine', env.DATA_SOURCE_BASE_URL) : 'http://query-engine/query',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  const response = local
    ? await fetch(request)
    : await getContainer(env.QUERY_ENGINE, workspaceId).fetch(request);
  const responseText = await response.text();
  let result: QueryEngineResponse<T>;
  try {
    result = JSON.parse(responseText) as QueryEngineResponse<T>;
  } catch {
    throw new Error(responseText || `Query engine returned HTTP ${response.status}.`);
  }
  if (!response.ok || !result.ok) {
    if (!result.ok && response.status === 400)
      throw new ApiError(400, 'invalid_query', safeQueryMessage(result.error));
    throw new Error(result.ok ? `Query engine returned HTTP ${response.status}.` : result.error);
  }
  return result.data;
}
