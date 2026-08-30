import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';
import { useEffect, useState, type CSSProperties } from 'react';
import { ChevronsUpDown, X } from 'lucide-react';
import type { ControlState, DashboardDocument, DashboardWidget } from '#/domain/schema';
import { callApi } from '#/api/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '#/components/ui/chart';
import { Badge } from '#/components/ui/badge';
import { Button } from '#/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '#/components/ui/command';
import { Field, FieldLabel } from '#/components/ui/field';
import { Input } from '#/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '#/components/ui/popover';
import { Skeleton } from '#/components/ui/skeleton';
import { widgetQueryRequest } from '#/domain/widget-query';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table';

export function DashboardView({
  dashboard,
  shareToken,
}: {
  dashboard: DashboardDocument;
  shareToken?: string;
}) {
  const [controlState, setControlState] = useState<ControlState>(() =>
    initialControlState(dashboard),
  );
  const ordered = [...dashboard.widgets].sort(
    (left, right) => left.layout.y - right.layout.y || left.layout.x - right.layout.x,
  );
  return (
    <div className="grid grid-cols-1 gap-4 md:auto-rows-[4rem] md:grid-cols-12">
      {ordered.map((widget) => (
        <div
          key={widget.id}
          className="min-w-0 md:[grid-column:var(--grid-column)] md:[grid-row:var(--grid-row)] [&>[data-slot=card]]:h-full"
          style={
            {
              '--grid-column': `${widget.layout.x + 1} / span ${Math.min(widget.layout.width, 12)}`,
              '--grid-row': `${widget.layout.y + 1} / span ${widget.layout.height}`,
            } as CSSProperties
          }
        >
          <Widget
            widget={widget}
            dashboardId={dashboard.id}
            shareToken={shareToken}
            controlState={controlState}
            setControlState={setControlState}
          />
        </div>
      ))}
    </div>
  );
}

function Widget({
  widget,
  dashboardId,
  shareToken,
  preview,
  controlState,
  setControlState,
}: {
  widget: DashboardWidget;
  dashboardId: string;
  shareToken?: string;
  preview?: boolean;
  controlState: ControlState;
  setControlState: (state: ControlState) => void;
}) {
  if (widget.definition.type === 'text')
    return (
      <Card>
        <CardContent className="pt-(--card-spacing)">
          <p className="whitespace-pre-wrap">{richText(widget.definition.content.document)}</p>
        </CardContent>
      </Card>
    );
  if (widget.definition.type === 'dateControl')
    return (
      <DateControl
        widgetId={widget.id}
        controlState={controlState}
        setControlState={setControlState}
      />
    );
  if (widget.definition.type === 'control')
    return (
      <FilterControl
        widgetId={widget.id}
        definitionHash={widget.definitionHash}
        definition={widget.definition}
        dashboardId={dashboardId}
        shareToken={shareToken}
        controlState={controlState}
        setControlState={setControlState}
      />
    );
  return (
    <QueryCard
      widget={widget}
      dashboardId={dashboardId}
      shareToken={shareToken}
      preview={preview}
      controlState={controlState}
    />
  );
}

export function DashboardWidgetView({
  dashboard,
  widget,
  preview = false,
  controlState,
  setControlState,
}: {
  dashboard: DashboardDocument;
  widget: DashboardWidget;
  preview?: boolean;
  controlState: ControlState;
  setControlState: (state: ControlState) => void;
}) {
  return (
    <Widget
      widget={widget}
      dashboardId={dashboard.id}
      preview={preview}
      controlState={controlState}
      setControlState={setControlState}
    />
  );
}

function DateControl({
  widgetId,
  controlState,
  setControlState,
}: {
  widgetId: string;
  controlState: ControlState;
  setControlState: (state: ControlState) => void;
}) {
  const range = controlState.dateRange;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Date range</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor={`date-start-${widgetId}`}>Start</FieldLabel>
          <Input
            id={`date-start-${widgetId}`}
            type="date"
            value={range && 'fixed' in range.startDate ? range.startDate.fixed : ''}
            onChange={(event) =>
              setControlState({
                ...controlState,
                dateRange: {
                  startDate: { fixed: event.target.value },
                  endDate: range?.endDate ?? { fixed: event.target.value },
                },
              })
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`date-end-${widgetId}`}>End</FieldLabel>
          <Input
            id={`date-end-${widgetId}`}
            type="date"
            value={range && 'fixed' in range.endDate ? range.endDate.fixed : ''}
            onChange={(event) =>
              setControlState({
                ...controlState,
                dateRange: {
                  startDate: range?.startDate ?? { fixed: event.target.value },
                  endDate: { fixed: event.target.value },
                },
              })
            }
          />
        </Field>
      </CardContent>
    </Card>
  );
}

function FilterControl({
  widgetId,
  definitionHash,
  definition,
  dashboardId,
  shareToken,
  controlState,
  setControlState,
}: {
  widgetId: string;
  definitionHash: string;
  definition: Extract<DashboardWidget['definition'], { type: 'control' }>;
  dashboardId: string;
  shareToken?: string;
  controlState: ControlState;
  setControlState: (state: ControlState) => void;
}) {
  const [values, setValues] = useState<unknown[]>([]);
  const [search, setSearch] = useState('');
  const [retry, setRetry] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let current = true;
    setStatus('loading');
    const timeout = setTimeout(() => {
      void callApi<{ values: unknown[] }>({
        action: 'getControlOptions',
        dashboardId,
        controlId: widgetId,
        shareToken,
        ...(search ? { search } : {}),
      })
        .then((result) => {
          if (!current) return;
          setValues(result.values);
          setStatus('ready');
        })
        .catch(() => {
          if (current) setStatus('error');
        });
    }, 250);
    return () => {
      current = false;
      clearTimeout(timeout);
    };
  }, [dashboardId, definitionHash, retry, search, shareToken, widgetId]);
  const selected = (controlState.values?.[widgetId] ?? []).map(String);
  const updateSelected = (next: string[]) =>
    setControlState({
      ...controlState,
      values: { ...controlState.values, [widgetId]: next },
    });
  const select = (value: string) => {
    if (!definition.allowMultiple) {
      updateSelected([value]);
      setOpen(false);
      return;
    }
    updateSelected(
      selected.includes(value)
        ? selected.filter((selectedValue) => selectedValue !== value)
        : [...selected, value],
    );
  };
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{definition.userDefinedName ?? 'Filter'}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                className="w-full justify-between font-normal"
                aria-label={`Choose ${definition.userDefinedName ?? 'filter'} values`}
              />
            }
          >
            {selected.length
              ? definition.allowMultiple
                ? `${selected.length} selected`
                : selected[0]
              : 'All values'}
            <ChevronsUpDown className="size-4 opacity-50" />
          </PopoverTrigger>
          <PopoverContent className="w-(--anchor-width) p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput value={search} onValueChange={setSearch} placeholder="Search values…" />
              <CommandList>
                {status === 'loading' ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
                ) : status === 'error' ? (
                  <div className="flex flex-col items-center gap-2 py-6 text-sm">
                    <p>Could not load values.</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRetry((value) => value + 1)}
                    >
                      Retry
                    </Button>
                  </div>
                ) : (
                  <>
                    <CommandEmpty>No values found.</CommandEmpty>
                    <CommandGroup>
                      {values.map((value) => {
                        const option = String(value);
                        const checked = selected.includes(option);
                        return (
                          <CommandItem
                            key={option}
                            value={option}
                            data-checked={checked}
                            onSelect={() => select(option)}
                          >
                            {option}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {selected.length ? (
          <div className="flex flex-wrap gap-1.5">
            {selected.map((value) => (
              <Badge key={value} variant="secondary" className="gap-1 pr-1">
                {value}
                <button
                  type="button"
                  className="rounded-sm p-0.5 hover:bg-muted"
                  aria-label={`Remove ${value}`}
                  onClick={() => updateSelected(selected.filter((item) => item !== value))}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
            <Button variant="ghost" size="xs" onClick={() => updateSelected([])}>
              Clear
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function QueryCard({
  widget,
  dashboardId,
  shareToken,
  preview,
  controlState,
}: {
  widget: DashboardWidget;
  dashboardId: string;
  shareToken?: string;
  preview?: boolean;
  controlState: ControlState;
}) {
  const [rows, setRows] = useState<Record<string, unknown>[]>();
  const [comparisonRows, setComparisonRows] = useState<Record<string, unknown>[]>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let current = true;
    setRows(undefined);
    setComparisonRows(undefined);
    void callApi<{
      rows: Record<string, unknown>[];
      comparisonRows?: Record<string, unknown>[];
    }>(
      widgetQueryRequest({
        dashboardId,
        widget,
        controlState,
        preview: preview ?? false,
        shareToken,
      }),
    )
      .then((result) => {
        if (!current) return;
        setRows(result.rows);
        setComparisonRows(result.comparisonRows);
        setError(undefined);
      })
      .catch((caught: unknown) => {
        if (current) setError(caught instanceof Error ? caught.message : String(caught));
      });
    return () => {
      current = false;
    };
  }, [controlState, dashboardId, preview, shareToken, widget.definition, widget.id]);
  const definition = widget.definition;
  if (!('title' in definition)) return null;
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{definition.title}</CardTitle>
        {error ? <CardDescription>{error}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        {!rows ? (
          <Skeleton className="h-28 w-full" />
        ) : (
          <Result definition={definition} rows={rows} comparisonRows={comparisonRows} />
        )}
      </CardContent>
    </Card>
  );
}

function Result({
  definition,
  rows,
  comparisonRows,
}: {
  definition: Extract<DashboardWidget['definition'], { title: string }>;
  rows: Record<string, unknown>[];
  comparisonRows?: Record<string, unknown>[];
}) {
  const columns = Object.keys(rows[0] ?? {});
  if (definition.type === 'scorecard' || definition.type === 'gauge') {
    const value = rows[0]?.[columns[0] ?? ''];
    const previous = comparisonRows?.[0]?.[Object.keys(comparisonRows[0] ?? {})[0] ?? ''];
    const maximum =
      definition.type === 'gauge' && definition.upperLimit?.kind === 'manual'
        ? definition.upperLimit.value
        : undefined;
    return (
      <div className="space-y-2">
        <p className="text-4xl font-semibold tracking-tight">
          {formatValue(value, definition.metric.dataType, definition.metric.displayFormat?.radix)}
        </p>
        {previous !== undefined ? (
          <p className="text-sm text-muted-foreground">
            Previous:{' '}
            {formatValue(
              previous,
              definition.metric.dataType,
              definition.metric.displayFormat?.radix,
            )}
          </p>
        ) : null}
        {maximum !== undefined ? (
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            aria-label={`${String(value)} of ${maximum}`}
          >
            <div
              className="h-full bg-primary"
              style={{ width: `${Math.min(100, Math.max(0, (Number(value) / maximum) * 100))}%` }}
            />
          </div>
        ) : null}
      </div>
    );
  }
  if (definition.type === 'table')
    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column}>{column}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={index}>
                {columns.map((column) => (
                  <TableCell key={column}>{formatValue(row[column])}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  if (!rows.length || columns.length < 2)
    return <p className="text-sm text-muted-foreground">No rows for this date range.</p>;
  const dimension = columns[0]!;
  const metrics = columns.slice(1);
  const config = Object.fromEntries(
    metrics.map((metric, index) => [
      metric,
      { label: metric, color: `var(--chart-${(index % 5) + 1})` },
    ]),
  );
  if (definition.type === 'pie')
    return (
      <ChartContainer className="mx-auto aspect-square max-h-72" config={config}>
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent />} />
          <Pie data={rows} dataKey={metrics[0]} nameKey={dimension} fill="var(--color-metric_1)" />
        </PieChart>
      </ChartContainer>
    );
  if (definition.type === 'bar')
    return (
      <ChartContainer className="h-72 w-full" config={config}>
        <BarChart data={rows}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey={dimension} />
          <YAxis />
          <ChartTooltip content={<ChartTooltipContent />} />
          {metrics.map((metric) => (
            <Bar key={metric} dataKey={metric} fill={`var(--color-${metric})`} />
          ))}
        </BarChart>
      </ChartContainer>
    );
  return (
    <ChartContainer className="h-72 w-full" config={config}>
      <LineChart data={rows}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={dimension} />
        <YAxis />
        <ChartTooltip content={<ChartTooltipContent />} />
        {metrics.map((metric) => (
          <Line key={metric} dataKey={metric} stroke={`var(--color-${metric})`} dot={false} />
        ))}
      </LineChart>
    </ChartContainer>
  );
}

export function initialControlState(dashboard: DashboardDocument): ControlState {
  const dateControl = dashboard.widgets.find((widget) => widget.definition.type === 'dateControl');
  const values = Object.fromEntries(
    dashboard.widgets.flatMap((widget) =>
      widget.definition.type === 'control' && widget.definition.defaultValues?.length
        ? [[widget.id, widget.definition.defaultValues]]
        : [],
    ),
  );
  return {
    ...(dateControl?.definition.type === 'dateControl'
      ? { dateRange: dateControl.definition.defaultDateRange ?? dashboard.defaultDateRange }
      : {}),
    ...(Object.keys(values).length ? { values } : {}),
  };
}

function richText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(richText).join('\n');
  if (value && typeof value === 'object')
    return Object.values(value).map(richText).filter(Boolean).join(' ');
  return '';
}
function formatValue(value: unknown, type?: string, radix = 2) {
  if (typeof value !== 'number') return value == null ? '' : String(value);
  if (type === 'percent')
    return new Intl.NumberFormat(undefined, {
      style: 'percent',
      maximumFractionDigits: radix,
    }).format(value);
  if (type === 'currency')
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: radix,
    }).format(value);
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: radix }).format(value);
}
