import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileDataPlugin } from './dev/file-data-plugin.ts';
import { queryEnginePlugin } from './dev/query-engine-plugin.ts';

// Browser tests run the dev server on their own port; the dev data service must follow it.
const devPort = resolveDevPort(process.env.RUNDOWN_PORT);
const devDataBaseUrl = `http://localhost:${devPort}/__dev-data`;

function resolveDevPort(value: string | undefined) {
  if (!value) return 3000;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(`RUNDOWN_PORT must be a port number, received "${value}".`);
  return port;
}

export default defineConfig(({ command }) => ({
  build: {
    minify: 'oxc',
  },
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    port: devPort,
    strictPort: true,
    // Miniflare writes its D1/KV/trace SQLite state here on every start; not app source.
    watch: { ignored: ['**/.wrangler/**'] },
  },
  plugins: [
    fileDataPlugin(),
    queryEnginePlugin(),
    cloudflare({
      viteEnvironment: { name: 'ssr' },
      config: (config) => ({
        dev: {
          ...config.dev,
          // Cloudflare images are amd64. DuckDB's native binding crashes when Docker emulates
          // that architecture on Apple Silicon, so local queries run in Vite instead.
          enable_containers: command !== 'serve',
        },
        ...(command === 'serve'
          ? {
              vars: {
                DATA_SOURCE_BASE_URL: devDataBaseUrl,
                QUERY_DATA_SOURCE_BASE_URL: devDataBaseUrl,
              },
            }
          : {}),
      }),
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
}));
