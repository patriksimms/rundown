import { env } from 'cloudflare:workers';

import {
  checkReadiness,
  createReadinessResponse,
  type ReadinessChecks,
  type ReadinessDependency,
} from './readiness';

const checks: ReadinessChecks = {
  d1: async () => {
    await env.DB.prepare('SELECT 1').first();
  },
  kv: async () => {
    await env.QUERY_CACHE.get('__readiness__');
  },
  r2: async () => {
    await env.DATA.list({ limit: 1, prefix: '__readiness__/' });
  },
};

export async function handleReadinessRequest() {
  const result = await checkReadiness(checks, logDependencyFailure);
  return createReadinessResponse(result);
}

function logDependencyFailure(dependency: ReadinessDependency, error: unknown) {
  console.error(
    JSON.stringify({
      event: 'readiness_check_failed',
      dependency,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
}
