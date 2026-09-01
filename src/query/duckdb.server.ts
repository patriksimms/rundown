import { getContainer } from '@cloudflare/containers';
import { env } from 'cloudflare:workers';
import { resolveDataSource } from '#/data/source.server';
import type {
  QueryEngineMetrics,
  QueryEngineRequest,
  QueryEngineResponse,
} from './engine-contract';
import type { DataSourceRecord } from './types';
import { safeQueryMessage } from './errors';
import { recordProductMetric } from '#/observability';

export class QueryEngineError extends Error {
  constructor(
    public readonly kind: 'invalid-query' | 'request-failed',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export async function runPreparedQuery<T extends Record<string, unknown>>(
  dataSource: DataSourceRecord,
  compile: (sourceSql: string) => { sql: string; parameters: unknown[] },
) {
  const queryId = crypto.randomUUID();
  const source = await resolveDataSource(dataSource, queryId);
  const query = compile(source.sql);
  const result = await queryEngineRequest<T[]>(dataSource.workspaceId, queryId, {
    operation: 'query',
    sql: query.sql,
    parameters: query.parameters,
  });
  console.info('rundown.query_execution', {
    queryId,
    workspaceId: dataSource.workspaceId,
    sourceBytes: source.sourceBytes,
    objectCount: source.objectKeys.length,
    ...result.metrics,
  });
  recordProductMetric('query_execution', {
    labels: ['success'],
    numbers: [
      result.metrics.containerStartMs,
      result.metrics.queryDurationMs,
      source.sourceBytes,
      result.metrics.resultBytes,
    ],
    index: dataSource.workspaceId,
  });
  return result.data;
}

export async function describeDataSource(dataSource: DataSourceRecord) {
  const queryId = crypto.randomUUID();
  const source = await resolveDataSource(dataSource, queryId);
  const result = await queryEngineRequest<{
    description: Array<{ column_name: string; column_type: string }>;
    samples: Record<string, unknown>[];
  }>(dataSource.workspaceId, queryId, {
    operation: 'describeSource',
    sourceSql: source.sql,
  });
  return result.data;
}

export async function ingestCsv(
  workspaceId: string,
  tokenId: string,
  sourceUrl: string,
  destinationUrl: string,
) {
  const result = await queryEngineRequest<{ size: number; etag: string | null }>(
    workspaceId,
    tokenId,
    { operation: 'ingestCsv', sourceUrl, destinationUrl },
  );
  console.info('rundown.datasource_ingestion', {
    workspaceId,
    tokenId,
    outputBytes: result.data.size,
    ...result.metrics,
  });
  return result.data;
}

async function queryEngineRequest<T>(
  workspaceId: string,
  queryId: string,
  body: QueryEngineRequest,
) {
  const local = !env.DATA_SOURCE_BASE_URL.startsWith('r2://');
  const request = new Request(
    local ? new URL('/__query-engine', env.DATA_SOURCE_BASE_URL) : 'http://query-engine/query',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  const startedAt = performance.now();
  const response = local
    ? await fetch(request)
    : await getContainer(env.QUERY_ENGINE, workspaceId).fetch(request);
  const totalDurationMs = performance.now() - startedAt;
  const responseText = await response.text();
  let result: QueryEngineResponse<T>;
  try {
    result = JSON.parse(responseText) as QueryEngineResponse<T>;
  } catch {
    throw new QueryEngineError(
      'request-failed',
      responseText || `Query engine returned HTTP ${response.status}.`,
    );
  }
  if (!response.ok || !result.ok) {
    console.warn('rundown.query_failure', {
      queryId,
      workspaceId,
      totalDurationMs,
      error: result.ok ? `HTTP ${response.status}` : safeQueryMessage(result.error),
    });
    recordProductMetric('query_execution', {
      labels: ['error'],
      numbers: [totalDurationMs],
      index: workspaceId,
    });
    if (!result.ok && response.status === 400)
      throw new QueryEngineError('invalid-query', safeQueryMessage(result.error));
    throw new QueryEngineError(
      'request-failed',
      result.ok ? `Query engine returned HTTP ${response.status}.` : result.error,
    );
  }
  return {
    data: result.data,
    metrics: queryMetrics(result.metrics, totalDurationMs),
  };
}

function queryMetrics(metrics: QueryEngineMetrics, totalDurationMs: number) {
  return {
    queryDurationMs: metrics.queryDurationMs,
    containerStartMs: Math.max(0, totalDurationMs - metrics.queryDurationMs),
    resultBytes: metrics.resultBytes,
  };
}
