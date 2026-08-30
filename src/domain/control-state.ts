import type { ControlState, DashboardDocument, DashboardWidget } from './schema';

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

export function withoutWidgetControlState(
  state: ControlState,
  widget: DashboardWidget,
  hasRemainingDateControl: boolean,
): ControlState {
  if (widget.definition.type === 'dateControl' && !hasRemainingDateControl) {
    const { dateRange: _removed, ...rest } = state;
    return rest;
  }
  if (widget.definition.type === 'control') {
    const values = { ...state.values };
    delete values[widget.id];
    return { ...state, values: Object.keys(values).length ? values : undefined };
  }
  return state;
}

export function singleValueControlWithMultipleSelections(
  dashboard: DashboardDocument,
  state: ControlState,
) {
  return dashboard.widgets.find(
    (widget) =>
      widget.definition.type === 'control' &&
      !widget.definition.allowMultiple &&
      (state.values?.[widget.id]?.length ?? 0) > 1,
  )?.id;
}
