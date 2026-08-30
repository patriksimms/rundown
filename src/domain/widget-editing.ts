import type { ControlState, WidgetDefinition } from '#/domain/schema';

export type WidgetFilter = NonNullable<Extract<WidgetDefinition, { type: 'scorecard' }>['filter']>;
type FilterCondition = WidgetFilter['conditions'][number];

export function patchFilterCondition(
  filter: WidgetFilter,
  index: number,
  patch: Partial<FilterCondition>,
): WidgetFilter {
  return {
    ...filter,
    conditions: filter.conditions.map((condition, itemIndex) =>
      itemIndex === index ? { ...condition, ...patch } : condition,
    ),
  };
}

export function clearControlValue(state: ControlState, controlId: string): ControlState {
  return {
    ...state,
    values: { ...state.values, [controlId]: [] },
  };
}
