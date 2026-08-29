import { describe, expect, it } from 'vitest';
import { mergeControlState } from './control-state';

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
});
