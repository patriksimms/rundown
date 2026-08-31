import { describe, expect, it } from 'vitest';
import { queryResultState } from './request-state';

describe('query result state', () => {
  it.each([
    [undefined, undefined, 'loading'],
    [undefined, 'Invalid formula', 'error'],
    [[], undefined, 'empty'],
    [[{ value: 1 }], undefined, 'success'],
  ] as const)('returns exactly one state', (rows, error, expected) => {
    expect(queryResultState(rows, error)).toBe(expected);
  });
});
