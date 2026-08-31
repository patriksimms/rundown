import type { ApiRequest } from '#/api/contracts';
import type { ControlState, DashboardWidget } from '#/domain/schema';

export function widgetQueryRequest({
  dashboardId,
  widget,
  controlState,
  preview,
  shareToken,
  page,
}: {
  dashboardId: string;
  widget: DashboardWidget;
  controlState: ControlState;
  preview: boolean;
  shareToken?: string;
  page?: number;
}): Extract<ApiRequest, { action: 'previewWidget' | 'queryWidget' }> {
  return preview
    ? {
        action: 'previewWidget',
        dashboardId,
        definition: widget.definition,
        controlState,
      }
    : {
        action: 'queryWidget',
        dashboardId,
        widgetId: widget.id,
        shareToken,
        controlState,
        page,
      };
}
