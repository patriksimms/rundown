import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { callApi } from '#/api/client';
import { AppShell } from '#/components/app-shell';
import { DashboardBuilder, type BuilderDataSource } from '#/components/dashboard-builder';
import { DashboardSharing, type SharingState } from '#/components/dashboard-sharing';
import { DashboardView } from '#/components/dashboard-view';
import { ErrorState, LoadingState } from '#/components/request-state';
import { Badge } from '#/components/ui/badge';
import type { DashboardDocument } from '#/domain/schema';
import { useWebMcpTools } from '#/webmcp/use-webmcp-tools';

export const Route = createFileRoute('/dashboards/$dashboardId')({ component: DashboardPage });

interface DashboardPayload {
  dashboard: DashboardDocument;
  role: 'admin' | 'editor' | 'viewer';
  dataSources: BuilderDataSource[];
  sharing?: SharingState;
}

function DashboardPage() {
  const { dashboardId } = Route.useParams();
  const [payload, setPayload] = useState<DashboardPayload>();
  const [error, setError] = useState<string>();
  const refresh = useCallback(async () => {
    try {
      setPayload(await callApi<DashboardPayload>({ action: 'getDashboard', dashboardId }));
      setError(undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [dashboardId]);
  useEffect(() => void refresh(), [refresh]);
  const canEdit = payload?.role === 'admin' || payload?.role === 'editor';
  useWebMcpTools({
    dashboardId,
    canCreate: Boolean(payload),
    canEdit,
    isAdmin: payload?.role === 'admin',
    onMutation: refresh,
  });
  return (
    <AppShell requireWorkspace>
      <main className="mx-auto w-full max-w-[100rem] px-4 py-6 sm:px-6">
        {error ? (
          <ErrorState error={error} />
        ) : !payload ? (
          <LoadingState />
        ) : (
          <div className="flex flex-col gap-5">
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-3xl font-semibold tracking-tight">
                    {payload.dashboard.name}
                  </h1>
                  <Badge variant="secondary">{payload.role}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {payload.dashboard.timezone} · {payload.dashboard.widgets.length} widgets
                </p>
              </div>
              {canEdit ? (
                <DashboardSharing
                  dashboardId={dashboardId}
                  sharing={payload.sharing ?? { links: [], grants: [] }}
                  refresh={refresh}
                />
              ) : null}
            </header>
            {canEdit ? (
              <DashboardBuilder
                dashboard={payload.dashboard}
                dataSources={payload.dataSources}
                refresh={refresh}
              />
            ) : (
              <DashboardView dashboard={payload.dashboard} />
            )}
          </div>
        )}
      </main>
    </AppShell>
  );
}
