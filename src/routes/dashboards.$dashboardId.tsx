import { createFileRoute } from '@tanstack/react-router';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { callApi } from '#/api/client';
import { AppShell } from '#/components/app-shell';
import { DashboardView } from '#/components/dashboard-view';
import { ErrorState, LoadingState } from '#/components/request-state';
import { Alert, AlertDescription } from '#/components/ui/alert';
import { Badge } from '#/components/ui/badge';
import { Button } from '#/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '#/components/ui/field';
import { Input } from '#/components/ui/input';
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select';
import { Separator } from '#/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs';
import { Textarea } from '#/components/ui/textarea';
import type { DashboardDocument, DashboardWidget, WidgetDefinition } from '#/domain/schema';
import { sharedUserLabel } from '#/domain/sharing';
import { useWebMcpTools } from '#/webmcp/use-webmcp-tools';

export const Route = createFileRoute('/dashboards/$dashboardId')({ component: DashboardPage });

interface DashboardPayload {
  dashboard: DashboardDocument;
  role: 'admin' | 'editor' | 'viewer';
  dataSources: Array<{ id: string; name: string }>;
  sharing?: SharingState;
}
interface SharingState {
  links: Array<{ token: string; url: string; createdAt: string }>;
  grants: Array<{
    clerkUserId: string;
    userEmail?: string;
    displayName?: string;
    role: string;
    grantedAt: string;
  }>;
}
interface DescribedSource {
  id: string;
  fields: Array<{ id: string; label: string; role: string; semanticType: string }>;
  calculatedFields: Array<{ id: string; label: string; role: string; semanticType: string }>;
}
type BuilderType =
  | 'scorecard'
  | 'line'
  | 'bar'
  | 'pie'
  | 'table'
  | 'control'
  | 'dateControl'
  | 'text';

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
    <AppShell>
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
        {error ? (
          <ErrorState error={error} />
        ) : !payload ? (
          <LoadingState />
        ) : (
          <div className="flex flex-col gap-6">
            <header>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-semibold tracking-tight">{payload.dashboard.name}</h1>
                <Badge variant="secondary">{payload.role}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {payload.dashboard.timezone} · {payload.dashboard.widgets.length} widgets
              </p>
            </header>
            {canEdit ? (
              <Tabs defaultValue="dashboard">
                <TabsList>
                  <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
                  <TabsTrigger value="edit">Edit</TabsTrigger>
                  <TabsTrigger value="formulas">Formulas</TabsTrigger>
                  <TabsTrigger value="share">Share</TabsTrigger>
                </TabsList>
                <TabsContent value="dashboard" className="pt-4">
                  <DashboardView dashboard={payload.dashboard} />
                </TabsContent>
                <TabsContent value="edit" className="pt-4">
                  <Editor payload={payload} refresh={refresh} />
                </TabsContent>
                <TabsContent value="formulas" className="pt-4">
                  <DashboardFormulas payload={payload} />
                </TabsContent>
                <TabsContent value="share" className="pt-4">
                  <Sharing
                    dashboardId={dashboardId}
                    sharing={payload.sharing ?? { links: [], grants: [] }}
                    refresh={refresh}
                  />
                </TabsContent>
              </Tabs>
            ) : (
              <DashboardView dashboard={payload.dashboard} />
            )}
          </div>
        )}
      </main>
    </AppShell>
  );
}

function Editor({ payload, refresh }: { payload: DashboardPayload; refresh: () => Promise<void> }) {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Widgets</h2>
        {payload.dashboard.widgets.map((widget) => (
          <WidgetEditor
            key={widget.id}
            dashboardId={payload.dashboard.id}
            widget={widget}
            refresh={refresh}
          />
        ))}
      </div>
      <AddWidget
        dashboard={payload.dashboard}
        dataSources={payload.dataSources}
        refresh={refresh}
      />
    </div>
  );
}

function WidgetEditor({
  dashboardId,
  widget,
  refresh,
}: {
  dashboardId: string;
  widget: DashboardWidget;
  refresh: () => Promise<void>;
}) {
  const originalTitle =
    'title' in widget.definition
      ? widget.definition.title
      : widget.definition.type === 'control'
        ? (widget.definition.userDefinedName ?? 'Control')
        : widget.definition.type;
  const [title, setTitle] = useState(originalTitle);
  const [definitionText, setDefinitionText] = useState(JSON.stringify(widget.definition, null, 2));
  const [width, setWidth] = useState(widget.layout.width);
  const [height, setHeight] = useState(widget.layout.height);
  const [error, setError] = useState<string>();
  const editable = 'title' in widget.definition || widget.definition.type === 'control';
  async function save() {
    try {
      const parsed = JSON.parse(definitionText) as WidgetDefinition;
      const definition =
        'title' in parsed
          ? { ...parsed, title }
          : parsed.type === 'control'
            ? { ...parsed, userDefinedName: title }
            : parsed;
      await callApi({ action: 'updateWidget', dashboardId, widgetId: widget.id, definition });
      await callApi({
        action: 'moveWidget',
        dashboardId,
        widgetId: widget.id,
        placement: { ...widget.layout, width, height },
      });
      setError(undefined);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }
  async function remove() {
    await callApi({ action: 'removeWidget', dashboardId, widgetId: widget.id });
    await refresh();
  }
  return (
    <div className="grid gap-3 border-b pb-5 lg:grid-cols-[minmax(0,1fr)_8rem_8rem_auto] lg:items-end">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`title-${widget.id}`}>{widget.definition.type}</FieldLabel>
          <Input
            id={`title-${widget.id}`}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={!editable}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`definition-${widget.id}`}>Definition</FieldLabel>
          <Textarea
            id={`definition-${widget.id}`}
            className="min-h-40 font-mono text-xs"
            value={definitionText}
            onChange={(event) => setDefinitionText(event.target.value)}
          />
          {error ? <FieldDescription className="text-destructive">{error}</FieldDescription> : null}
        </Field>
      </FieldGroup>
      <Field>
        <FieldLabel htmlFor={`width-${widget.id}`}>Width</FieldLabel>
        <Input
          id={`width-${widget.id}`}
          type="number"
          min={1}
          max={12}
          value={width}
          onChange={(event) => setWidth(event.target.valueAsNumber)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`height-${widget.id}`}>Height</FieldLabel>
        <Input
          id={`height-${widget.id}`}
          type="number"
          min={1}
          value={height}
          onChange={(event) => setHeight(event.target.valueAsNumber)}
        />
      </Field>
      <div className="flex gap-2">
        <Button variant="outline" onClick={save}>
          Save
        </Button>
        <Button variant="ghost" size="icon" aria-label={`Remove ${originalTitle}`} onClick={remove}>
          <Trash2Icon />
        </Button>
      </div>
    </div>
  );
}

function DashboardFormulas({ payload }: { payload: DashboardPayload }) {
  const [kind, setKind] = useState<'calculated' | 'library'>('calculated');
  const [sourceId, setSourceId] = useState(payload.dataSources[0]?.id ?? '');
  const [name, setName] = useState('');
  const [expression, setExpression] = useState('');
  const [message, setMessage] = useState<string>();
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (kind === 'calculated') {
      await callApi({
        action: 'upsertCalculatedField',
        dashboardId: payload.dashboard.id,
        dataSourceId: sourceId,
        name,
        expression,
        role: 'metric',
        semanticType: 'count',
      });
    } else {
      await callApi({
        action: 'upsertLibraryMetric',
        dashboardId: payload.dashboard.id,
        name,
        expression,
        semanticType: 'ratio',
      });
    }
    setMessage(`${name} saved.`);
    setName('');
    setExpression('');
  }
  return (
    <form className="max-w-2xl" onSubmit={submit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="formula-kind">Formula type</FieldLabel>
          <NativeSelect
            id="formula-kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as typeof kind)}
          >
            <NativeSelectOption value="calculated">Calculated field</NativeSelectOption>
            <NativeSelectOption value="library">Workspace library metric</NativeSelectOption>
          </NativeSelect>
        </Field>
        {kind === 'calculated' ? (
          <Field>
            <FieldLabel htmlFor="formula-source">Datasource</FieldLabel>
            <NativeSelect
              id="formula-source"
              value={sourceId}
              onChange={(event) => setSourceId(event.target.value)}
            >
              {payload.dataSources.map((source) => (
                <NativeSelectOption key={source.id} value={source.id}>
                  {source.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        ) : null}
        <Field>
          <FieldLabel htmlFor="formula-name">Name</FieldLabel>
          <Input id="formula-name" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="formula-expression">DuckDB SQL expression</FieldLabel>
          <Textarea
            id="formula-expression"
            className="min-h-32 font-mono"
            value={expression}
            onChange={(event) => setExpression(event.target.value)}
          />
        </Field>
        <Button
          type="submit"
          disabled={!name || !expression || (kind === 'calculated' && !sourceId)}
        >
          Save formula
        </Button>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </FieldGroup>
    </form>
  );
}

function AddWidget({
  dashboard,
  dataSources,
  refresh,
}: {
  dashboard: DashboardDocument;
  dataSources: DashboardPayload['dataSources'];
  refresh: () => Promise<void>;
}) {
  const [sourceId, setSourceId] = useState(dataSources[0]?.id ?? '');
  const [source, setSource] = useState<DescribedSource>();
  const [type, setType] = useState<BuilderType>('scorecard');
  const [title, setTitle] = useState('New widget');
  const [dateField, setDateField] = useState('');
  const [dimension, setDimension] = useState('');
  const [metric, setMetric] = useState('');
  const [expression, setExpression] = useState('');
  const [error, setError] = useState<string>();
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    if (!sourceId) return;
    setSource(undefined);
    setError(undefined);
    void callApi<DescribedSource>({ action: 'describeDatasource', dataSourceId: sourceId })
      .then((result) => {
        setSource(result);
        const all = [...result.fields, ...result.calculatedFields];
        setDateField(all.find((field) => field.role === 'date')?.id ?? '');
        setDimension(all.find((field) => field.role === 'dimension')?.id ?? '');
        setMetric(all.find((field) => field.role === 'metric')?.id ?? '');
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : String(caught));
      });
  }, [sourceId]);

  async function add(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    setIsAdding(true);
    try {
      const definition = makeDefinition({
        type,
        title,
        sourceId,
        dateField,
        dimension,
        metric,
        expression,
      });
      await callApi({
        action: 'addWidget',
        dashboardId: dashboard.id,
        definition,
        width: ['scorecard', 'control', 'dateControl'].includes(type) ? 4 : 8,
        height: 3,
      });
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsAdding(false);
    }
  }

  const allFields = [...(source?.fields ?? []), ...(source?.calculatedFields ?? [])];
  const needsSource = type !== 'dateControl' && type !== 'text';
  const needsDimension = !['scorecard', 'dateControl', 'text'].includes(type);
  const needsMetric = !['control', 'dateControl', 'text'].includes(type);
  const canAdd =
    !isAdding &&
    Boolean(title.trim()) &&
    (!needsSource || Boolean(source && sourceId)) &&
    (!needsSource || type === 'control' || Boolean(dateField)) &&
    (!needsDimension || Boolean(dimension)) &&
    (!needsMetric || Boolean(metric || expression.trim()));
  return (
    <aside>
      <h2 className="mb-4 text-lg font-semibold">Add widget</h2>
      <form onSubmit={add}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="widget-type">Type</FieldLabel>
            <NativeSelect
              id="widget-type"
              value={type}
              onChange={(event) => setType(event.target.value as BuilderType)}
            >
              {(
                [
                  'scorecard',
                  'line',
                  'bar',
                  'pie',
                  'table',
                  'control',
                  'dateControl',
                  'text',
                ] as const
              ).map((item) => (
                <NativeSelectOption key={item} value={item}>
                  {item}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="widget-title">Title</FieldLabel>
            <Input
              id="widget-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          {needsSource ? (
            <>
              <Field>
                <FieldLabel htmlFor="widget-source">Datasource</FieldLabel>
                <NativeSelect
                  id="widget-source"
                  value={sourceId}
                  onChange={(event) => setSourceId(event.target.value)}
                >
                  {dataSources.map((item) => (
                    <NativeSelectOption key={item.id} value={item.id}>
                      {item.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              {type !== 'control' ? (
                <Field>
                  <FieldLabel htmlFor="widget-date">Date field</FieldLabel>
                  <FieldSelect
                    id="widget-date"
                    value={dateField}
                    setValue={setDateField}
                    fields={allFields.filter((field) => field.role === 'date')}
                  />
                </Field>
              ) : null}
              {type !== 'scorecard' ? (
                <Field>
                  <FieldLabel htmlFor="widget-dimension">Dimension</FieldLabel>
                  <FieldSelect
                    id="widget-dimension"
                    value={dimension}
                    setValue={setDimension}
                    fields={allFields.filter((field) => field.role !== 'metric')}
                  />
                </Field>
              ) : null}
              {type !== 'control' ? (
                <>
                  <Field>
                    <FieldLabel htmlFor="widget-metric">Metric</FieldLabel>
                    <FieldSelect
                      id="widget-metric"
                      value={metric}
                      setValue={setMetric}
                      fields={allFields.filter((field) => field.role === 'metric')}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="widget-expression">Aggregate expression</FieldLabel>
                    <Textarea
                      id="widget-expression"
                      value={expression}
                      onChange={(event) => setExpression(event.target.value)}
                      placeholder={'Optional DuckDB SQL, for example SUM("MediaCost")'}
                    />
                    <FieldDescription>
                      When set, this replaces the selected metric.
                    </FieldDescription>
                  </Field>
                </>
              ) : null}
            </>
          ) : type === 'text' ? (
            <Field>
              <FieldLabel htmlFor="widget-text">Text</FieldLabel>
              <Textarea
                id="widget-text"
                value={expression}
                onChange={(event) => setExpression(event.target.value)}
              />
            </Field>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" disabled={!canAdd}>
            <PlusIcon data-icon="inline-start" />
            {isAdding ? 'Adding widget...' : 'Add widget'}
          </Button>
        </FieldGroup>
      </form>
    </aside>
  );
}

function FieldSelect({
  id,
  value,
  setValue,
  fields,
}: {
  id: string;
  value: string;
  setValue: (value: string) => void;
  fields: Array<{ id: string; label: string }>;
}) {
  return (
    <NativeSelect id={id} value={value} onChange={(event) => setValue(event.target.value)}>
      {fields.map((field) => (
        <NativeSelectOption key={field.id} value={field.id}>
          {field.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

function makeDefinition(input: {
  type: BuilderType;
  title: string;
  sourceId: string;
  dateField: string;
  dimension: string;
  metric: string;
  expression: string;
}): WidgetDefinition {
  if (input.type === 'dateControl') return { type: 'dateControl' };
  if (input.type === 'text')
    return {
      type: 'text',
      content: { schemaVersion: 'plain-text-v1', document: input.expression || input.title },
    };
  if (input.type === 'control')
    return {
      type: 'control',
      dataSourceId: input.sourceId,
      fieldId: input.dimension,
      allowMultiple: true,
      userDefinedName: input.title,
    };
  const metric = {
    source: input.expression
      ? { kind: 'expression' as const, expression: input.expression }
      : { kind: 'field' as const, fieldId: input.metric, aggregation: 'sum' as const },
    dataType: 'number' as const,
  };
  const base = {
    title: input.title,
    dataSourceId: input.sourceId,
    dateRangeFieldId: input.dateField,
  };
  if (input.type === 'scorecard') return { ...base, type: input.type, metric };
  if (input.type === 'line')
    return {
      ...base,
      type: input.type,
      dimension: { fieldId: input.dimension },
      metrics: [metric],
    };
  if (input.type === 'table')
    return {
      ...base,
      type: input.type,
      dimensions: [{ fieldId: input.dimension }],
      metrics: [metric],
      resultLimit: { mode: 'top', amount: 50 },
    };
  return { ...base, type: input.type, dimension: { fieldId: input.dimension }, metric, limit: 20 };
}

function Sharing({
  dashboardId,
  sharing,
  refresh,
}: {
  dashboardId: string;
  sharing: SharingState;
  refresh: () => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'viewer' | 'editor'>('viewer');
  const [message, setMessage] = useState<string>();
  async function mutate(action: () => Promise<void>, success: string) {
    setMessage(undefined);
    try {
      await action();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught));
      return false;
    }
    try {
      await refresh();
      setMessage(success);
    } catch (caught) {
      const error = caught instanceof Error ? caught.message : String(caught);
      setMessage(`${success} Refresh failed: ${error}`);
    }
    return true;
  }
  async function createLink() {
    await mutate(
      () =>
        callApi({
          action: 'shareDashboard',
          dashboardId,
          operation: { kind: 'createLink' },
        }),
      'Created an unlisted link.',
    );
  }
  async function grant(event: FormEvent) {
    event.preventDefault();
    const granted = await mutate(
      () =>
        callApi({
          action: 'shareDashboard',
          dashboardId,
          operation: { kind: 'grant', userEmail: email, role },
        }),
      `Granted ${role} access to ${email}.`,
    );
    if (granted) setEmail('');
  }
  async function revokeLink(token: string) {
    await mutate(
      () =>
        callApi({
          action: 'shareDashboard',
          dashboardId,
          operation: { kind: 'revokeLink', token },
        }),
      'Revoked the unlisted link.',
    );
  }
  async function revokeGrant(userId: string) {
    await mutate(
      () =>
        callApi({
          action: 'shareDashboard',
          dashboardId,
          operation: { kind: 'revoke', userId },
        }),
      'Revoked user access.',
    );
  }
  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-semibold">Sharing</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Links are read-only. User grants require a Clerk account.
      </p>
      <div className="my-6 space-y-4">
        <Button onClick={createLink}>Create unlisted link</Button>
        {sharing.links.map((link) => (
          <div className="flex items-center gap-3" key={link.token}>
            <a className="min-w-0 flex-1 break-all text-sm underline" href={link.url}>
              {link.url}
            </a>
            <Button
              aria-label="Revoke unlisted link"
              size="icon-sm"
              variant="ghost"
              onClick={() => revokeLink(link.token)}
            >
              <Trash2Icon />
            </Button>
          </div>
        ))}
      </div>
      <Separator />
      <form className="mt-6" onSubmit={grant}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="share-email">User email</FieldLabel>
            <Input
              id="share-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="share-role">Role</FieldLabel>
            <NativeSelect
              id="share-role"
              value={role}
              onChange={(event) => setRole(event.target.value as typeof role)}
            >
              <NativeSelectOption value="viewer">Viewer</NativeSelectOption>
              <NativeSelectOption value="editor">Editor</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Button type="submit">Grant access</Button>
        </FieldGroup>
      </form>
      {message ? <p className="mt-3 text-sm text-muted-foreground">{message}</p> : null}
      {sharing.grants.length ? (
        <div className="mt-8 space-y-3">
          <h3 className="text-sm font-medium">People with access</h3>
          {sharing.grants.map((grant) => {
            const label = sharedUserLabel(grant);
            return (
              <div className="flex items-center gap-3 text-sm" key={grant.clerkUserId}>
                <span className="min-w-0 flex-1 truncate">{label}</span>
                <span className="text-muted-foreground">{grant.role}</span>
                <Button
                  aria-label={`Revoke ${label}`}
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => revokeGrant(grant.clerkUserId)}
                >
                  <Trash2Icon />
                </Button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
