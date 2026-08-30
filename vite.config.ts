import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileDataPlugin } from './dev/file-data-plugin.ts';
import { queryEnginePlugin } from './dev/query-engine-plugin.ts';

export default defineConfig(({ command }) => ({
  build: {
    minify: 'oxc',
  },
  resolve: {
    tsconfigPaths: true,
  },
  server: {
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
                DATA_SOURCE_BASE_URL: 'http://localhost:3000/__dev-data',
                QUERY_DATA_SOURCE_BASE_URL: 'http://localhost:3000/__dev-data',
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
