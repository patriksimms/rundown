import { describe, expect, it } from 'vitest';
import { dateBucketTarget, resolveDateGranularity } from './date-granularity';

describe('date granularity', () => {
  it('uses stable bucket targets for small, medium, and wide widgets', () => {
    expect([4, 5, 8, 9].map(dateBucketTarget)).toEqual([30, 60, 60, 90]);
  });

  it('picks the finest automatic granularity that fits the widget', () => {
    const year = { start: '2026-01-01', end: '2026-12-31' };
    expect(resolveDateGranularity('auto', year, 30)).toBe('month');
    expect(resolveDateGranularity('auto', year, 60)).toBe('week');
    expect(resolveDateGranularity('auto', year, 90)).toBe('week');
  });

  it('keeps an explicit granularity unchanged', () => {
    expect(resolveDateGranularity('quarter', { start: '2020-01-01', end: '2026-12-31' }, 30)).toBe(
      'quarter',
    );
  });
});
