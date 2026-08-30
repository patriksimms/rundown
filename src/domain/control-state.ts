import type { ControlState } from './schema';

export function mergeControlState(defaults: ControlState, input?: ControlState): ControlState {
  return {
    ...defaults,
    ...input,
    values: { ...defaults.values, ...input?.values },
  };
}

export function withDefaultDateRange(
  state: ControlState,
  dateRange: NonNullable<ControlState['dateRange']>,
) {
  return state.dateRange ? state : { ...state, dateRange };
}
