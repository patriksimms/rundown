import { describe, expect, it } from 'vitest';
import { safeQueryMessage } from './errors';

describe('query errors', () => {
  it('keeps useful DuckDB detail while making the message safe to render', () => {
    expect(safeQueryMessage(' Binder Error:\n  Referenced column "spned" not found ')).toBe(
      'Binder Error: Referenced column "spned" not found',
    );
  });

  it('bounds messages returned to the client', () => {
    expect(safeQueryMessage('x'.repeat(2_000))).toHaveLength(1_000);
  });
});
