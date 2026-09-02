import type { DashboardWidget } from './schema';

export interface LayoutUpdate {
  widgetId: string;
  placement: DashboardWidget['layout'];
}

export const MIN_CANVAS_ROWS = 10;

export function occupiedRowCount(widgets: DashboardWidget[]) {
  return widgets.reduce(
    (bottom, widget) => Math.max(bottom, widget.layout.y + widget.layout.height),
    0,
  );
}

export function defaultCanvasRows(widgets: DashboardWidget[]) {
  return Math.max(MIN_CANVAS_ROWS, occupiedRowCount(widgets) + 2);
}

export function requiredCanvasRows(widgets: DashboardWidget[]) {
  return Math.max(MIN_CANVAS_ROWS, occupiedRowCount(widgets));
}

export function validRowCuts(widgets: DashboardWidget[]) {
  const lastCut = occupiedRowCount(widgets);
  return Array.from({ length: lastCut + 1 }, (_, cut) => cut).filter((cut) =>
    widgets.every(
      (widget) => !(widget.layout.y < cut && widget.layout.y + widget.layout.height > cut),
    ),
  );
}

export function rowInsertionCuts(widgets: DashboardWidget[], canvasRows: number) {
  const occupiedRows = occupiedRowCount(widgets);
  return [...validRowCuts(widgets).filter((cut) => cut < occupiedRows), canvasRows].filter(
    (cut, index, cuts) => cuts.indexOf(cut) === index,
  );
}

export function isRowEmpty(widgets: DashboardWidget[], row: number) {
  return widgets.every(
    (widget) => row < widget.layout.y || row >= widget.layout.y + widget.layout.height,
  );
}

export function insertRow(widgets: DashboardWidget[], canvasRows: number, cut: number) {
  if (
    cut < 0 ||
    cut > canvasRows ||
    widgets.some((widget) => widget.layout.y < cut && widget.layout.y + widget.layout.height > cut)
  )
    return undefined;
  return {
    canvasRows: Math.max(requiredCanvasRows(widgets), canvasRows) + 1,
    widgets: widgets.map((widget) =>
      widget.layout.y >= cut
        ? { ...widget, layout: { ...widget.layout, y: widget.layout.y + 1 } }
        : widget,
    ),
  };
}

export function removeEmptyRow(widgets: DashboardWidget[], canvasRows: number, row: number) {
  if (row < 0 || row >= canvasRows || canvasRows <= MIN_CANVAS_ROWS || !isRowEmpty(widgets, row))
    return undefined;
  const shifted = widgets.map((widget) =>
    widget.layout.y > row
      ? { ...widget, layout: { ...widget.layout, y: widget.layout.y - 1 } }
      : widget,
  );
  const nextCanvasRows = canvasRows - 1;
  if (nextCanvasRows < requiredCanvasRows(shifted)) return undefined;
  return { widgets: shifted, canvasRows: nextCanvasRows };
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

export function rollbackFailedLayoutState(
  current: { widgets: DashboardWidget[]; canvasRows: number },
  previous: { placements: ReadonlyMap<string, DashboardWidget['layout']>; canvasRows: number },
  failed: { placements: ReadonlyMap<string, DashboardWidget['layout']>; canvasRows: number },
) {
  const stillFailed =
    current.canvasRows === failed.canvasRows &&
    current.widgets.every((widget) => {
      const placement = failed.placements.get(widget.id);
      return placement && samePlacement(widget.layout, placement);
    });
  if (!stillFailed) return current;
  return {
    ...current,
    canvasRows: previous.canvasRows,
    widgets: current.widgets.map((widget) => ({
      ...widget,
      layout: previous.placements.get(widget.id) ?? widget.layout,
    })),
  };
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
