import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileDataPlugin } from './dev/file-data-plugin.ts';

export default defineConfig(({ command }) => ({
  build: {
    minify: 'oxc',
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    fileDataPlugin(),
    cloudflare({
      viteEnvironment: { name: 'ssr' },
      auxiliaryWorkers: [{ configPath: './query-worker/wrangler.jsonc' }],
      ...(command === 'serve'
        ? { config: { vars: { DATA_SOURCE_BASE_URL: 'http://localhost:3000/__dev-data' } } }
        : {}),
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
}));
