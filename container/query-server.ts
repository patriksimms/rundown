import { executeQueryEngineRequest } from './query-engine';

const server = Bun.serve({
  port: 8080,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/ready') return Response.json({ ok: true });
    if (url.pathname !== '/query' || request.method !== 'POST')
      return Response.json({ ok: false, error: 'Not found.' }, { status: 404 });

    try {
      const startedAt = performance.now();
      const data = await executeQueryEngineRequest(await request.json());
      const resultBytes = new TextEncoder().encode(JSON.stringify(data)).byteLength;
      return Response.json({
        ok: true,
        data,
        metrics: { queryDurationMs: performance.now() - startedAt, resultBytes },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown query engine error.';
      console.error('Query engine request failed', { message });
      return Response.json({ ok: false, error: message }, { status: 400 });
    }
  },
});

console.log(`Query engine listening on port ${server.port}`);
