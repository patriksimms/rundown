export function queryResultState(rows: readonly unknown[] | undefined, error?: string) {
  if (error) return 'error' as const;
  if (!rows) return 'loading' as const;
  if (!rows.length) return 'empty' as const;
  return 'success' as const;
}
