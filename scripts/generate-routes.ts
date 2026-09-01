// Writes src/routeTree.gen.ts without bundling the app.
//
// TanStack Start generates the route tree from a Vite plugin whose `configResolved` hook runs the
// generator. Resolving the project's Vite config therefore produces the exact same file a
// production build would, in a fraction of the time, and with no second source of generator
// options to keep in sync.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveConfig } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const configFile = fileURLToPath(new URL('../vite.config.ts', import.meta.url));
const routeTreePath = fileURLToPath(new URL('../src/routeTree.gen.ts', import.meta.url));

await resolveConfig({ root, configFile }, 'build', 'production', 'production');

if (!existsSync(routeTreePath))
  throw new Error(
    'Resolving the Vite config did not write src/routeTree.gen.ts. Check the route generator output above.',
  );
