import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { callApi } from '#/api/client';
import { DashboardView } from '#/components/dashboard-view';
import { ErrorState, LoadingState } from '#/components/request-state';
import type { DashboardDocument } from '#/domain/schema';
import { useWebMcpTools } from '#/webmcp/use-webmcp-tools';

export const Route = createFileRoute('/share/$token')({ component: SharedDashboard });

function SharedDashboard() {
  const { token } = Route.useParams();
  const [dashboard, setDashboard] = useState<DashboardDocument>();
  const [error, setError] = useState<string>();
  const refresh = useCallback(async () => {
    try {
      const result = await callApi<{ dashboard: DashboardDocument }>({
        action: 'getSharedDashboard',
        shareToken: token,
      });
      setDashboard(result.dashboard);
      setError(undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [token]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useWebMcpTools({ dashboardId: dashboard?.id, shareToken: token });
  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <p className="text-sm font-medium text-muted-foreground">Rundown</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {dashboard?.name ?? 'Shared dashboard'}
        </h1>
      </header>
      {error ? (
        <ErrorState error={error} />
      ) : !dashboard ? (
        <LoadingState />
      ) : (
        <DashboardView dashboard={dashboard} shareToken={token} />
      )}
    </main>
  );
}
