import { describe, expect, it } from 'vitest';
import { dateRangePresets } from './dates';
import { dateRangeSearchValue, parseDateRangeSearch } from './date-range-search';

describe('date range search params', () => {
  it('round-trips preset and fixed selections', () => {
    const preset = dateRangePresets.find((item) => item.id === 'last-30-days')!.range;
    expect(parseDateRangeSearch(dateRangeSearchValue(preset))).toEqual(preset);

    const fixed = {
      startDate: { fixed: '2026-08-01' as const },
      endDate: { fixed: '2026-08-31' as const },
    };
    expect(dateRangeSearchValue(fixed)).toBe('2026-08-01..2026-08-31');
    expect(parseDateRangeSearch(dateRangeSearchValue(fixed))).toEqual(fixed);
  });

  it('ignores malformed and reversed fixed ranges', () => {
    expect(parseDateRangeSearch('custom')).toBeUndefined();
    expect(parseDateRangeSearch('2026-08-31..2026-08-01')).toBeUndefined();
  });
});
