import { vi } from 'vitest';
import type { QueryEngineRequest } from '#/query/engine-contract';

/**
 * Replaces the HTTP hop to the DuckDB query engine. The Worker still compiles SQL, resolves
 * the datasource, and maps engine failures, so only the container itself is substituted.
 */

interface EngineReply {
  status?: number;
  body: unknown;
}

type EngineHandler = (request: QueryEngineRequest) => EngineReply | Promise<EngineReply>;

const emptyResult: EngineHandler = () => ({ body: { ok: true, data: [] } });

type IsolatedQueryRequest = Extract<QueryEngineRequest, { operation: 'isolatedQuery' }>;

const isWidgetQuery = (request: QueryEngineRequest): request is IsolatedQueryRequest =>
  request.operation === 'isolatedQuery' && !request.sql.startsWith('EXPLAIN ');

let handler: EngineHandler = emptyResult;
let calls: QueryEngineRequest[] = [];

export const queryEngine = {
  /** Every request the Worker sent to the engine, oldest first. */
  get calls() {
    return calls;
  },

  /** Requests that ran a widget query rather than an `EXPLAIN` validation. */
  get queryCalls() {
    return calls.filter(isWidgetQuery);
  },

  install() {
    const passThrough = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      if (!new URL(request.url).pathname.endsWith('/__query-engine'))
        return passThrough(input as RequestInfo, init);
      const body = (await request.json()) as QueryEngineRequest;
      calls.push(body);
      const reply = await handler(body);
      return new Response(JSON.stringify(reply.body), {
        status: reply.status ?? 200,
        headers: { 'content-type': 'application/json' },
      });
    });
  },

  reset() {
    calls = [];
    handler = emptyResult;
  },

  /** Answer every widget query with these rows; `EXPLAIN` validations stay empty. */
  returnRows(rows: Record<string, unknown>[]) {
    handler = (request) =>
      isWidgetQuery(request)
        ? { body: { ok: true, data: rows } }
        : { body: { ok: true, data: [] } };
  },

  /** Reject widget queries the way the engine rejects invalid SQL. */
  rejectQueries(status: number, error: string) {
    handler = (request) =>
      isWidgetQuery(request)
        ? { status, body: { ok: false, error } }
        : { body: { ok: true, data: [] } };
  },

  answerWith(next: EngineHandler) {
    handler = next;
  },
};
