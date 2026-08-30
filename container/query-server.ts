import { executeQueryEngineRequest } from './query-engine';

const server = Bun.serve({
  port: 8080,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/ready') return Response.json({ ok: true });
    if (url.pathname !== '/query' || request.method !== 'POST')
      return Response.json({ ok: false, error: 'Not found.' }, { status: 404 });

    try {
      const data = await executeQueryEngineRequest(await request.json(), process.env);
      return Response.json({ ok: true, data });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown query engine error.';
      console.error('Query engine request failed', { message });
      return Response.json({ ok: false, error: message }, { status: 400 });
    }
  },
});

console.log(`Query engine listening on port ${server.port}`);
