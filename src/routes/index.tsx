import { Show } from '@clerk/tanstack-react-start';
import { Link, createFileRoute } from '@tanstack/react-router';
import { PlusIcon } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { callApi } from '#/api/client';
import { AppShell } from '#/components/app-shell';
import { ErrorState, LoadingState } from '#/components/request-state';
import { Button } from '#/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty';
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field';
import { Input } from '#/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table';
import { useWebMcpTools } from '#/webmcp/use-webmcp-tools';

export const Route = createFileRoute('/')({ component: Home });

interface Bootstrap {
  workspace: { id: string; name: string };
  isAdmin: boolean;
  dashboards: Array<{ id: string; name: string; widgetCount: number; updatedAt: string }>;
  dataSources: Array<{ id: string; name: string }>;
}

function Home() {
  return (
    <AppShell>
      <Show when="signed-out">
        <SignedOut />
      </Show>
      <Show when="signed-in">
        <DashboardIndex />
      </Show>
    </AppShell>
  );
}

function SignedOut() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-7xl flex-col justify-center px-4 py-16 sm:px-6">
      <p className="mb-3 text-sm font-medium text-muted-foreground">
        Client reporting without the rebuild
      </p>
      <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
        Describe the report. Fine-tune it in the browser.
      </h1>
      <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
        Rundown turns reporting intent into query-backed dashboards while keeping every formula,
        filter, and access rule inspectable.
      </p>
    </main>
  );
}

function DashboardIndex() {
  const [data, setData] = useState<Bootstrap>();
  const [error, setError] = useState<string>();
  const [name, setName] = useState('');
  const refresh = useCallback(async () => {
    try {
      setData(await callApi<Bootstrap>({ action: 'bootstrap' }));
      setError(undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useWebMcpTools({ canCreate: Boolean(data), isAdmin: data?.isAdmin, onMutation: refresh });
  async function create(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const dashboard = await callApi<{ id: string }>({
      action: 'createDashboard',
      name,
      dataSourceIds: [],
      timezone: 'Europe/Berlin',
    });
    window.location.assign(`/dashboards/${dashboard.id}`);
  }
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      {error ? (
        <ErrorState error={error} />
      ) : !data ? (
        <LoadingState />
      ) : (
        <div className="flex flex-col gap-8">
          <div>
            <p className="text-sm text-muted-foreground">{data.workspace.name}</p>
            <h1 className="text-3xl font-semibold tracking-tight">Dashboards</h1>
          </div>
          <form className="flex max-w-xl items-end gap-3" onSubmit={create}>
            <FieldGroup className="flex-1">
              <Field>
                <FieldLabel htmlFor="dashboard-name">New dashboard</FieldLabel>
                <Input
                  id="dashboard-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Campaign overview"
                />
              </Field>
            </FieldGroup>
            <Button type="submit">
              <PlusIcon data-icon="inline-start" />
              Create
            </Button>
          </form>
          {data.dashboards.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Widgets</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.dashboards.map((dashboard) => (
                    <TableRow key={dashboard.id}>
                      <TableCell>
                        <Link
                          className="font-medium hover:underline"
                          to="/dashboards/$dashboardId"
                          params={{ dashboardId: dashboard.id }}
                        >
                          {dashboard.name}
                        </Link>
                      </TableCell>
                      <TableCell>{dashboard.widgetCount}</TableCell>
                      <TableCell>{new Date(dashboard.updatedAt).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No dashboards yet</EmptyTitle>
                <EmptyDescription>
                  Create one here or ask an agent to build it through the site tools.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent />
            </Empty>
          )}
        </div>
      )}
    </main>
  );
}
