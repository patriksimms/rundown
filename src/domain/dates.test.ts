import { describe, expect, it } from 'vitest';
import { comparisonDateRange, resolveDateRange } from './dates';

describe('date range resolution', () => {
  it('resolves relative dates in the dashboard timezone', () => {
    expect(
      resolveDateRange(
        {
          startDate: {
            relative: { amount: 1, unit: 'day', direction: 'past', anchor: 'startOfDay' },
          },
          endDate: {
            relative: { amount: 0, unit: 'day', direction: 'past', anchor: 'startOfDay' },
          },
        },
        'Europe/Berlin',
        new Date('2026-08-29T23:30:00Z'),
      ),
    ).toEqual({ start: '2026-08-29', end: '2026-08-30' });
  });

  it('honors week anchors before applying the relative offset', () => {
    expect(
      resolveDateRange(
        {
          startDate: {
            relative: { amount: 1, unit: 'week', direction: 'past', anchor: 'startOfWeek' },
          },
          endDate: {
            relative: { amount: 0, unit: 'day', direction: 'past', anchor: 'startOfWeek' },
          },
        },
        'Europe/Berlin',
        new Date('2026-08-29T12:00:00Z'),
      ),
    ).toEqual({ start: '2026-08-17', end: '2026-08-24' });
  });

  it('builds inclusive previous-period and previous-year ranges', () => {
    const range = {
      startDate: { fixed: '2026-08-01' as const },
      endDate: { fixed: '2026-08-10' as const },
    };
    expect(comparisonDateRange(range, 'previousPeriod', 'UTC')).toEqual({
      startDate: { fixed: '2026-07-22' },
      endDate: { fixed: '2026-07-31' },
    });
    expect(comparisonDateRange(range, 'previousYear', 'UTC')).toEqual({
      startDate: { fixed: '2025-08-01' },
      endDate: { fixed: '2025-08-10' },
    });
  });
});
