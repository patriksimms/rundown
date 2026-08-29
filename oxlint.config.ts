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
  },
});
