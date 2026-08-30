import { describe, expect, it } from 'vitest';
import { mergeControlState, withDefaultDateRange } from './control-state';

describe('dashboard control defaults', () => {
  const defaults = {
    dateRange: {
      startDate: {
        relative: {
          amount: 30,
          unit: 'day' as const,
          direction: 'past' as const,
          anchor: 'startOfDay' as const,
        },
      },
      endDate: {
        relative: {
          amount: 0,
          unit: 'day' as const,
          direction: 'past' as const,
          anchor: 'startOfDay' as const,
        },
      },
    },
    values: { region: ['EMEA'], channel: ['search'] },
  };

  it('uses dashboard defaults when WebMCP omits control state', () => {
    expect(mergeControlState(defaults)).toEqual(defaults);
  });

  it('overrides only controls supplied by the caller', () => {
    expect(mergeControlState(defaults, { values: { region: ['APAC'] } })).toEqual({
      ...defaults,
      values: { region: ['APAC'], channel: ['search'] },
    });
  });

  it('fills a missing date range when a date control is added', () => {
    expect(withDefaultDateRange({}, defaults.dateRange)).toEqual({
      dateRange: defaults.dateRange,
    });
  });

  it('preserves a user-selected date range', () => {
    const selected = {
      startDate: { fixed: '2026-02-01' as const },
      endDate: { fixed: '2026-02-28' as const },
    };

    expect(withDefaultDateRange({ dateRange: selected }, defaults.dateRange)).toEqual({
      dateRange: selected,
    });
  });
});
