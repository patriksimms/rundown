import { defineConfig } from 'oxlint';

export default defineConfig({
  options: {
    typeAware: false,
  },
  plugins: ['eslint', 'typescript', 'vitest', 'promise', 'import', 'node'],
  categories: {
    correctness: 'warn',
  },
  rules: {
    'eslint/no-unused-vars': 'error',
    // Integration tests assert through shared helpers rather than inline `expect` calls.
    'vitest/expect-expect': ['warn', { assertFunctionNames: ['expect', 'expectApiError'] }],
  },
});
