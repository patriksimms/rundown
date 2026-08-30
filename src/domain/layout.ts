import type { DashboardWidget } from './schema';

export interface LayoutUpdate {
  widgetId: string;
  placement: DashboardWidget['layout'];
}

export function appendPlacement(
  widgets: DashboardWidget[],
  width: number,
  height: number,
  columns = 12,
) {
  const safeWidth = Math.min(width, columns);
  const bottom = widgets.reduce(
    (current, widget) => Math.max(current, widget.layout.y + widget.layout.height),
    0,
  );
  return { x: 0, y: bottom, width: safeWidth, height };
}

export function placementFits(
  widgets: DashboardWidget[],
  candidate: DashboardWidget['layout'],
  columns = 12,
  ignoredWidgetId?: string,
) {
  if (candidate.x + candidate.width > columns) return false;
  return widgets.every((widget) => {
    if (widget.id === ignoredWidgetId) return true;
    const existing = widget.layout;
    return (
      candidate.x + candidate.width <= existing.x ||
      existing.x + existing.width <= candidate.x ||
      candidate.y + candidate.height <= existing.y ||
      existing.y + existing.height <= candidate.y
    );
  });
}

export function validateLayoutUpdate(
  widgets: DashboardWidget[],
  updates: LayoutUpdate[],
  columns = 12,
) {
  const expectedIds = new Set(widgets.map((widget) => widget.id));
  const receivedIds = new Set(updates.map((update) => update.widgetId));
  if (receivedIds.size !== updates.length) return false;
  if (receivedIds.size !== expectedIds.size) return false;
  if ([...receivedIds].some((id) => !expectedIds.has(id))) return false;

  const placed = updates.map((update) => ({
    ...widgets.find((widget) => widget.id === update.widgetId)!,
    layout: update.placement,
  }));
  return placed.every((widget) => placementFits(placed, widget.layout, columns, widget.id));
}

export function rollbackFailedLayout(
  widgets: DashboardWidget[],
  previous: ReadonlyMap<string, DashboardWidget['layout']>,
  failed: ReadonlyMap<string, DashboardWidget['layout']>,
) {
  return widgets.map((widget) => {
    const previousPlacement = previous.get(widget.id);
    const failedPlacement = failed.get(widget.id);
    return previousPlacement && failedPlacement && samePlacement(widget.layout, failedPlacement)
      ? { ...widget, layout: previousPlacement }
      : widget;
  });
}

function samePlacement(left: DashboardWidget['layout'], right: DashboardWidget['layout']) {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}
