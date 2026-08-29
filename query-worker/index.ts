import type { QueryEngineRequest, QueryEngineResponse } from '../src/query/engine-contract';
import { createQueryEngine, type QueryWorkerEnv } from './engine';
import wasmModule from './duckdb-workers.wasm';

const execute = createQueryEngine(wasmModule);

export default {
  async fetch(request, environment) {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/query')
      return Response.json({ ok: false, error: 'Not found.' }, { status: 404 });

    try {
      const input = parseRequest(await request.json());
      const data = await execute(input, environment);
      return json<QueryEngineResponse<unknown>>({ ok: true, data });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Query engine failed.';
      console.error(JSON.stringify({ event: 'query_engine_failed', error: message }));
      return json<QueryEngineResponse<never>>({ ok: false, error: message }, 400);
    }
  },
} satisfies ExportedHandler<QueryWorkerEnv>;

function parseRequest(input: unknown): QueryEngineRequest {
  if (!isObject(input) || typeof input.sourceSql !== 'string' || !input.sourceSql)
    throw new Error('Invalid query engine request.');
  if (input.operation === 'describeSource')
    return { operation: input.operation, sourceSql: input.sourceSql };
  if (
    input.operation === 'isolatedQuery' &&
    typeof input.sql === 'string' &&
    input.sql &&
    Array.isArray(input.parameters)
  )
    return {
      operation: input.operation,
      sourceSql: input.sourceSql,
      sql: input.sql,
      parameters: input.parameters,
    };
  throw new Error('Invalid query engine request.');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function json<T>(body: T, status = 200) {
  return Response.json(normalize(body), { status });
}

function normalize(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (isObject(value))
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]));
  return value;
}
