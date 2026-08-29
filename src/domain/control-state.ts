import type { ControlState } from './schema';

export function mergeControlState(defaults: ControlState, input?: ControlState): ControlState {
  return {
    ...defaults,
    ...input,
    values: { ...defaults.values, ...input?.values },
  };
}
