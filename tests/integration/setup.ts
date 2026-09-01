import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { resetClerk } from './doubles/clerk';
import { queryEngine } from './doubles/query-engine';

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

beforeEach(async () => {
  queryEngine.install();
  // D1 rows stay unique per test through generated ids; cache keys are content-derived,
  // so the KV namespace is the one binding that needs clearing between tests.
  const { keys } = await env.QUERY_CACHE.list();
  await Promise.all(keys.map((key) => env.QUERY_CACHE.delete(key.name)));
});

afterEach(() => {
  vi.unstubAllGlobals();
  queryEngine.reset();
  resetClerk();
});
