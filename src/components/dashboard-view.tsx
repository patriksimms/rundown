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
import { useEffect, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { ChevronsUpDown, X } from 'lucide-react';
import type { ControlState, DashboardDocument, DashboardWidget } from '#/domain/schema';
import type { QueryResultColumn } from '#/domain/query-result';
import { callApi } from '#/api/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '#/components/ui/chart';
import { Badge } from '#/components/ui/badge';
import { Button } from '#/components/ui/button';
import { Command, CommandGroup, CommandInput, CommandList } from '#/components/ui/command';
import { Field, FieldLabel } from '#/components/ui/field';
import { Input } from '#/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '#/components/ui/popover';
import { Skeleton } from '#/components/ui/skeleton';
import { widgetQueryRequest } from '#/domain/widget-query';
import { controlDefaultValues, toggleControlValue } from '#/domain/control-state';
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
      updateSelected(toggleControlValue(selected, value, false));
      setOpen(false);
      return;
    }
    updateSelected(toggleControlValue(selected, value, true));
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
            <Command shouldFilter={false} label={definition.userDefinedName ?? 'Filter values'}>
              <CommandInput value={search} onValueChange={setSearch} placeholder="Search values…" />
              <CommandList aria-multiselectable={definition.allowMultiple || undefined}>
                {status === 'loading' ? (
                  <div role="status" className="py-6 text-center text-sm text-muted-foreground">
                    Loading…
                  </div>
                ) : status === 'error' ? (
                  <div role="alert" className="flex flex-col items-center gap-2 py-6 text-sm">
                    <p>Could not load values.</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRetry((value) => value + 1)}
                    >
                      Retry
                    </Button>
                  </div>
                ) : values.length ? (
                  <CommandGroup>
                    {values.map((value) => {
                      const option = String(value);
                      const checked = selected.includes(option);
                      return (
                        <button
                          type="button"
                          role="option"
                          key={option}
                          aria-selected={checked}
                          className="flex min-h-10 w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                          onKeyDown={handleFilterOptionKeyDown}
                          onClick={() => select(option)}
                        >
                          {option}
                          <span aria-hidden="true" className="ml-auto">
                            {checked ? '✓' : ''}
                          </span>
                        </button>
                      );
                    })}
                  </CommandGroup>
                ) : (
                  <div className="py-6 text-center text-sm">No values found.</div>
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
                  className="flex size-6 items-center justify-center rounded-sm hover:bg-muted"
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

function handleFilterOptionKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
  if (!['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) return;
  event.stopPropagation();
  if (event.key === 'Enter' || event.key === ' ') return;
  event.preventDefault();
  const options = [
    ...(event.currentTarget
      .closest('[role="listbox"]')
      ?.querySelectorAll<HTMLElement>('[role="option"]') ?? []),
  ];
  const index = options.indexOf(event.currentTarget);
  const direction = event.key === 'ArrowDown' ? 1 : -1;
  options[(index + direction + options.length) % options.length]?.focus();
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
  const [columns, setColumns] = useState<QueryResultColumn[]>();
  const [comparisonRows, setComparisonRows] = useState<Record<string, unknown>[]>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let current = true;
    setRows(undefined);
    setColumns(undefined);
    setComparisonRows(undefined);
    void callApi<{
      rows: Record<string, unknown>[];
      columns: QueryResultColumn[];
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
        setColumns(result.columns);
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
        {!rows || !columns ? (
          <Skeleton className="h-28 w-full" />
        ) : (
          <Result
            definition={definition}
            rows={rows}
            columns={columns}
            comparisonRows={comparisonRows}
          />
        )}
      </CardContent>
    </Card>
  );
}

export function Result({
  definition,
  rows,
  columns,
  comparisonRows,
}: {
  definition: Extract<DashboardWidget['definition'], { title: string }>;
  rows: Record<string, unknown>[];
  columns: QueryResultColumn[];
  comparisonRows?: Record<string, unknown>[];
}) {
  const dimensionColumns = columns.filter((column) => column.kind === 'dimension');
  const metricColumns = columns.filter((column) => column.kind === 'metric');
  if (definition.type === 'scorecard' || definition.type === 'gauge') {
    const metric = metricColumns[0]!;
    const value = rows[0]?.[metric.key];
    const previous = comparisonRows?.[0]?.[metric.key];
    const maximum =
      definition.type === 'gauge' && definition.upperLimit?.kind === 'manual'
        ? definition.upperLimit.value
        : undefined;
    return (
      <div className="space-y-2">
        <p className="text-4xl font-semibold tracking-tight">{formatValue(value, metric)}</p>
        {previous !== undefined ? (
          <p className="text-sm text-muted-foreground">Previous: {formatValue(previous, metric)}</p>
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
                <TableHead key={column.key}>{column.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={index}>
                {columns.map((column) => (
                  <TableCell key={column.key}>{formatValue(row[column.key], column)}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  if (!rows.length || !dimensionColumns.length || !metricColumns.length)
    return <p className="text-sm text-muted-foreground">No rows for this date range.</p>;
  let dimension = dimensionColumns[0]!;
  let chartRows = normalizeMetricValues(rows, metricColumns);
  let chartMetrics = metricColumns;
  if (definition.type === 'bar' && definition.breakdownDimension && dimensionColumns[1]) {
    const shaped = pivotBreakdownRows(
      chartRows,
      dimension.key,
      dimensionColumns[1].key,
      metricColumns[0]!,
    );
    chartRows = shaped.rows;
    chartMetrics = shaped.metrics;
  }
  if (definition.type === 'pie' && definition.breakdownDimension && dimensionColumns[1]) {
    chartRows = chartRows.map((row) => ({
      ...row,
      breakdown_label: `${String(row[dimension.key])} · ${String(row[dimensionColumns[1]!.key])}`,
    }));
    dimension = { ...dimension, key: 'breakdown_label' };
  }
  const config = Object.fromEntries(
    chartMetrics.map((metric, index) => [
      metric.key,
      { label: metric.label, color: `var(--chart-${(index % 5) + 1})` },
    ]),
  );
  const tooltip = (
    <ChartTooltip
      content={
        <ChartTooltipContent
          valueFormatter={(value, name) =>
            formatValue(value, columnByKey(metricColumns, String(name)))
          }
        />
      }
    />
  );
  if (definition.type === 'pie')
    return (
      <ChartContainer className="mx-auto aspect-square max-h-72" config={config}>
        <PieChart>
          {tooltip}
          <Pie
            data={chartRows}
            dataKey={metricColumns[0]!.key}
            nameKey={dimension.key}
            fill={`var(--color-${metricColumns[0]!.key})`}
          />
        </PieChart>
      </ChartContainer>
    );
  if (definition.type === 'bar')
    return (
      <ChartContainer className="h-72 w-full" config={config}>
        <BarChart data={chartRows}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey={dimension.key}
            tickFormatter={(value) => formatAxisValue(value, dimension)}
          />
          <YAxis tickFormatter={(value) => formatAxisValue(value, metricColumns[0]!)} />
          {tooltip}
          {chartMetrics.map((metric) => (
            <Bar key={metric.key} dataKey={metric.key} fill={`var(--color-${metric.key})`} />
          ))}
        </BarChart>
      </ChartContainer>
    );
  return (
    <ChartContainer className="h-72 w-full" config={config}>
      <LineChart data={chartRows}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey={dimension.key}
          tickFormatter={(value) => formatAxisValue(value, dimension)}
        />
        {metricColumns.some((metric) => metric.dataType !== 'percent') ? (
          <YAxis yAxisId="number" />
        ) : null}
        {metricColumns.some((metric) => metric.dataType === 'percent') ? (
          <YAxis
            yAxisId="percent"
            orientation={
              metricColumns.some((metric) => metric.dataType !== 'percent') ? 'right' : 'left'
            }
            tickFormatter={(value) =>
              new Intl.NumberFormat(undefined, {
                style: 'percent',
                notation: 'compact',
                maximumFractionDigits: 1,
              }).format(Number(value))
            }
          />
        ) : null}
        {tooltip}
        {metricColumns.map((metric) => (
          <Line
            key={metric.key}
            dataKey={metric.key}
            yAxisId={metric.dataType === 'percent' ? 'percent' : 'number'}
            stroke={`var(--color-${metric.key})`}
            dot={false}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}

export function initialControlState(dashboard: DashboardDocument): ControlState {
  const dateControl = dashboard.widgets.find((widget) => widget.definition.type === 'dateControl');
  const values = Object.fromEntries(
    dashboard.widgets.flatMap((widget) =>
      widget.definition.type === 'control' && controlDefaultValues(widget)?.length
        ? [[widget.id, controlDefaultValues(widget)]]
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
export function formatValue(value: unknown, column: QueryResultColumn) {
  const number = numericMetricValue(value, column);
  if (number === undefined) return value == null ? '' : String(value);
  const radix = column.radix ?? 2;
  if (column.dataType === 'duration') return formatDuration(number, radix);
  if (column.dataType === 'percent')
    return new Intl.NumberFormat(undefined, {
      style: 'percent',
      maximumFractionDigits: radix,
    }).format(number);
  if (column.dataType === 'currency')
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: radix,
      minimumFractionDigits: radix,
    }).format(number);
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: radix }).format(number);
}

function numericMetricValue(value: unknown, column: QueryResultColumn) {
  if (column.kind !== 'metric') return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const number = Number(value);
  if (/^[+-]?\d+$/u.test(value.trim()) && !Number.isSafeInteger(number)) return undefined;
  return Number.isFinite(number) ? number : undefined;
}

function pivotBreakdownRows(
  rows: Record<string, unknown>[],
  dimensionKey: string,
  breakdownKey: string,
  metric: QueryResultColumn,
) {
  const values = [...new Set(rows.map((row) => row[breakdownKey]))];
  const metrics = values.map((value, index) => ({
    ...metric,
    key: `breakdown_${index + 1}`,
    label: String(value),
  }));
  const metricByValue = new Map(values.map((value, index) => [value, metrics[index]!]));
  const pivoted = new Map<unknown, Record<string, unknown>>();
  for (const row of rows) {
    const dimension = row[dimensionKey];
    const target = pivoted.get(dimension) ?? { [dimensionKey]: dimension };
    const series = metricByValue.get(row[breakdownKey]);
    if (series) target[series.key] = row[metric.key];
    pivoted.set(dimension, target);
  }
  return { rows: [...pivoted.values()], metrics };
}

function normalizeMetricValues(rows: Record<string, unknown>[], metrics: QueryResultColumn[]) {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => {
        const column = metrics.find((metric) => metric.key === key);
        return [key, column ? (numericMetricValue(value, column) ?? value) : value];
      }),
    ),
  );
}

function columnByKey(columns: QueryResultColumn[], key: string) {
  return columns.find((column) => column.key === key) ?? columns[0]!;
}

function formatAxisValue(value: unknown, column: QueryResultColumn) {
  if (column.kind === 'dimension' && column.dataType === 'date' && typeof value === 'string') {
    const date = new Date(`${value.slice(0, 10)}T00:00:00`);
    if (!Number.isNaN(date.valueOf()))
      return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
  }
  const number = numericMetricValue(value, column);
  if (number === undefined) return String(value);
  if (column.dataType === 'percent')
    return new Intl.NumberFormat(undefined, {
      style: 'percent',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(number);
  return new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(number);
}

function formatDuration(seconds: number, radix: number) {
  const sign = seconds < 0 ? '-' : '';
  const absolute = Math.abs(seconds);
  if (absolute < 60)
    return `${sign}${new Intl.NumberFormat(undefined, { maximumFractionDigits: radix }).format(absolute)}s`;
  const rounded = Math.round(absolute);
  const hours = Math.floor(rounded / 3_600);
  const minutes = Math.floor((rounded % 3_600) / 60);
  const remainingSeconds = rounded % 60;
  return `${sign}${[
    hours ? `${hours}h` : '',
    minutes ? `${minutes}m` : '',
    remainingSeconds ? `${remainingSeconds}s` : '',
  ]
    .filter(Boolean)
    .join(' ')}`;
}
