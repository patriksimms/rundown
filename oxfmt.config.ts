import { defineConfig } from 'oxfmt';

export default defineConfig({
  ignorePatterns: ['docs/**', 'src/routeTree.gen.ts', 'worker-configuration.d.ts'],
  tabWidth: 2,
  singleQuote: true,
});
