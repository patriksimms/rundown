import { json } from 'node:stream/consumers';
import type { Plugin } from 'vite';
import { executeQueryEngineRequest } from '../container/query-engine.ts';

const route = '/__query-engine';

export function queryEnginePlugin(): Plugin {
  return {
    name: 'rundown-query-engine',
    apply: 'serve',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://localhost');
        if (url.pathname !== route) return next();

        response.setHeader('content-type', 'application/json');
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.setHeader('allow', 'POST');
          response.end(JSON.stringify({ ok: false, error: 'Method not allowed.' }));
          return;
        }

        try {
          const input: unknown = await json(request);
          const startedAt = performance.now();
          const data = await executeQueryEngineRequest(input);
          const resultBytes = new TextEncoder().encode(JSON.stringify(data)).byteLength;
          response.end(
            JSON.stringify({
              ok: true,
              data,
              metrics: { queryDurationMs: performance.now() - startedAt, resultBytes },
            }),
          );
        } catch (error) {
          response.statusCode = 400;
          response.end(
            JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : 'Unknown query engine error.',
            }),
          );
        }
      });
    },
  };
}
