import { describe, expect, it } from 'vitest';
import {
  comparisonDateRange,
  dateRangeOrderError,
  resolveDateRange,
  updateDateRangeBoundary,
} from './dates';

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

  it.each([
    ['month', 1, '2026-02-28'],
    ['quarter', 1, '2025-12-31'],
    ['year', 1, '2025-03-31'],
  ] as const)('clamps past %s offsets to the target month', (unit, amount, expected) => {
    const value = {
      relative: { amount, unit, direction: 'past' as const, anchor: 'now' as const },
    };
    expect(
      resolveDateRange(
        { startDate: value, endDate: value },
        'UTC',
        new Date('2026-03-31T12:00:00Z'),
      ).start,
    ).toBe(expected);
  });

  it('clamps leap day to February 28 when shifting by a year', () => {
    const value = {
      relative: {
        amount: 1,
        unit: 'year' as const,
        direction: 'past' as const,
        anchor: 'now' as const,
      },
    };
    expect(
      resolveDateRange(
        { startDate: value, endDate: value },
        'UTC',
        new Date('2024-02-29T12:00:00Z'),
      ).start,
    ).toBe('2023-02-28');
    expect(
      comparisonDateRange(
        { startDate: { fixed: '2024-02-29' }, endDate: { fixed: '2024-02-29' } },
        'previousYear',
        'UTC',
      ),
    ).toEqual({ startDate: { fixed: '2023-02-28' }, endDate: { fixed: '2023-02-28' } });
  });

  it('turns a relative range into valid fixed values when edited', () => {
    const range = {
      startDate: {
        relative: {
          amount: 7,
          unit: 'day' as const,
          direction: 'past' as const,
          anchor: 'now' as const,
        },
      },
      endDate: {
        relative: {
          amount: 0,
          unit: 'day' as const,
          direction: 'past' as const,
          anchor: 'now' as const,
        },
      },
    };
    expect(updateDateRangeBoundary(range, 'UTC', 'start', '2026-08-01').range).toEqual({
      startDate: { fixed: '2026-08-01' },
      endDate: { fixed: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
    });
    expect(updateDateRangeBoundary(range, 'UTC', 'start', '')).toEqual({});
  });

  it('rejects edits that put the start after the end', () => {
    expect(
      updateDateRangeBoundary(
        { startDate: { fixed: '2026-08-01' }, endDate: { fixed: '2026-08-10' } },
        'UTC',
        'start',
        '2026-08-11',
      ),
    ).toEqual({ error: 'The start date must not be after the end date.' });
  });

  it('reports a reversed relative default before it is edited', () => {
    expect(
      dateRangeOrderError(
        {
          startDate: {
            relative: { amount: 0, unit: 'day', direction: 'past', anchor: 'now' },
          },
          endDate: {
            relative: { amount: 7, unit: 'day', direction: 'past', anchor: 'now' },
          },
        },
        'UTC',
      ),
    ).toBe('The start date must not be after the end date.');
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
