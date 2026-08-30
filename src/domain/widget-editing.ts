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

export function filterInputValue(value: unknown, list: boolean) {
  if (list && Array.isArray(value)) return value.map(String).join(', ');
  return value == null ? '' : String(value);
}

export function filterValueFromInput(value: string, list: boolean) {
  return list
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : value;
}
