import type { D1Migration } from '@cloudflare/vitest-pool-workers';

declare global {
  namespace Cloudflare {
    interface Env {
      /** Migrations read from `drizzle/` by the integration Vitest config. */
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
