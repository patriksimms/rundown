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
import type { ControlState, DashboardDocument, DashboardWidget } from '#/domain/schema';
import { callApi } from '#/api/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card';
import { Button } from '#/components/ui/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '#/components/ui/chart';
import { Field, FieldLabel } from '#/components/ui/field';
import { Input } from '#/components/ui/input';
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select';
import { Skeleton } from '#/components/ui/skeleton';
import { widgetQueryRequest } from '#/domain/widget-query';
import {
  pieBreakdownRows,
  pivotBreakdownRows,
  tableSummary,
  withComparisonSeries,
} from '#/domain/widget-results';
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
  useEffect(() => {
    let current = true;
    async function loadOptions() {
      const result = await callApi<{ values: unknown[] }>({
        action: 'getControlOptions',
        dashboardId,
        controlId: widgetId,
        shareToken,
      });
      if (current) setValues(result.values);
    }
    void loadOptions();
    return () => {
      current = false;
    };
  }, [dashboardId, definitionHash, shareToken, widgetId]);
  const selected = controlState.values?.[widgetId]?.[0];
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{definition.userDefinedName ?? 'Filter'}</CardTitle>
      </CardHeader>
      <CardContent>
        <NativeSelect
          value={selected === undefined ? '' : String(selected)}
          onChange={(event) =>
            setControlState({
              ...controlState,
              values: {
                ...controlState.values,
                [widgetId]: event.target.value ? [event.target.value] : [],
              },
            })
          }
        >
          <NativeSelectOption value="">All</NativeSelectOption>
          {values.map((value) => (
            <NativeSelectOption key={String(value)} value={String(value)}>
              {String(value)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
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
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  useEffect(() => setPage(0), [controlState, dashboardId, widget.definition, widget.id]);
  useEffect(() => {
    let current = true;
    setRows(undefined);
    setComparisonRows(undefined);
    void callApi<{
      rows: Record<string, unknown>[];
      comparisonRows?: Record<string, unknown>[];
      hasMore?: boolean;
    }>(
      widgetQueryRequest({
        dashboardId,
        widget,
        controlState,
        preview: preview ?? false,
        shareToken,
        page,
      }),
    )
      .then((result) => {
        if (!current) return;
        setRows(result.rows);
        setComparisonRows(result.comparisonRows);
        setHasMore(Boolean(result.hasMore));
        setError(undefined);
      })
      .catch((caught: unknown) => {
        if (current) setError(caught instanceof Error ? caught.message : String(caught));
      });
    return () => {
      current = false;
    };
  }, [controlState, dashboardId, page, preview, shareToken, widget.definition, widget.id]);
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
          <Result
            definition={definition}
            rows={rows}
            comparisonRows={comparisonRows}
            page={page}
            hasMore={hasMore}
            setPage={setPage}
          />
        )}
      </CardContent>
    </Card>
  );
}

function Result({
  definition,
  rows,
  comparisonRows,
  page,
  hasMore,
  setPage,
}: {
  definition: Extract<DashboardWidget['definition'], { title: string }>;
  rows: Record<string, unknown>[];
  comparisonRows?: Record<string, unknown>[];
  page: number;
  hasMore: boolean;
  setPage: (page: number) => void;
}) {
  const columns = Object.keys(rows[0] ?? {});
  if (definition.type === 'scorecard' || definition.type === 'gauge') {
    const value = rows[0]?.[columns[0] ?? ''];
    const previous = comparisonRows?.[0]?.[Object.keys(comparisonRows[0] ?? {})[0] ?? ''];
    const maximum =
      definition.type === 'gauge'
        ? definition.upperLimit?.kind === 'manual'
          ? definition.upperLimit.value
          : rows[0]?.upper_limit
        : undefined;
    const numericMaximum = maximum == null ? undefined : Number(maximum);
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
        {numericMaximum !== undefined ? (
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            aria-label={`${String(value)} of ${numericMaximum}`}
          >
            <div
              className="h-full bg-primary"
              style={{
                width: `${Math.min(100, Math.max(0, (Number(value) / numericMaximum) * 100))}%`,
              }}
            />
          </div>
        ) : null}
      </div>
    );
  }
  if (definition.type === 'table') {
    const summary = definition.showSummaryRow ? tableSummary(definition, rows) : undefined;
    return (
      <div className="space-y-3 overflow-x-auto">
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
                {columns.map((column, columnIndex) => (
                  <TableCell key={column}>
                    {formatTableValue(definition, columnIndex, row[column])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {summary ? (
              <TableRow className="font-medium">
                {columns.map((column, columnIndex) => (
                  <TableCell key={column}>
                    {formatTableValue(definition, columnIndex, summary[column])}
                  </TableCell>
                ))}
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        {comparisonRows?.length ? (
          <div>
            <p className="mb-2 text-sm font-medium">Previous period</p>
            <Table>
              <TableBody>
                {comparisonRows.map((row, index) => (
                  <TableRow key={index}>
                    {columns.map((column, columnIndex) => (
                      <TableCell key={column}>
                        {formatTableValue(definition, columnIndex, row[column])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
        {definition.resultLimit.mode === 'pagination' ? (
          <div className="flex items-center justify-between text-sm">
            <span>
              {page * definition.resultLimit.amount + 1}–
              {page * definition.resultLimit.amount + rows.length}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!hasMore}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }
  if (!rows.length || columns.length < 2)
    return <p className="text-sm text-muted-foreground">No rows for this date range.</p>;
  let chartRows = comparisonRows?.length ? withComparisonSeries(rows, comparisonRows) : rows;
  let dimension = columns[0]!;
  let metrics = Object.keys(chartRows[0] ?? {}).slice(1);
  if (definition.type === 'bar' && definition.breakdownDimension) {
    const pivoted = pivotBreakdownRows(rows);
    chartRows = pivoted.rows;
    metrics = pivoted.series;
  }
  if (definition.type === 'pie' && definition.breakdownDimension) {
    chartRows = pieBreakdownRows(rows);
    dimension = 'label';
    metrics = [columns[2]!];
  }
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
          <Pie
            data={chartRows}
            dataKey={metrics[0]}
            nameKey={dimension}
            fill="var(--color-metric_1)"
          />
        </PieChart>
      </ChartContainer>
    );
  if (definition.type === 'bar')
    return (
      <ChartContainer className="h-72 w-full" config={config}>
        <BarChart data={chartRows}>
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
      <LineChart data={chartRows}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={dimension} />
        <YAxis yAxisId="number" />
        {definition.type === 'line' &&
        definition.metrics.some((metric) => metric.dataType === 'percent') ? (
          <YAxis
            yAxisId="percent"
            orientation="right"
            tickFormatter={(value) => `${Number(value) * 100}%`}
          />
        ) : null}
        <ChartTooltip content={<ChartTooltipContent />} />
        {metrics.map((metric) => (
          <Line
            key={metric}
            dataKey={metric}
            yAxisId={
              definition.type === 'line' &&
              definition.metrics[metrics.indexOf(metric)]?.dataType === 'percent'
                ? 'percent'
                : 'number'
            }
            stroke={`var(--color-${metric})`}
            strokeDasharray={metric.startsWith('Previous ') ? '4 4' : undefined}
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
function formatTableValue(
  definition: Extract<DashboardWidget['definition'], { type: 'table' }>,
  columnIndex: number,
  value: unknown,
) {
  const metric = definition.metrics[columnIndex - definition.dimensions.length];
  return formatValue(value, metric?.dataType, metric?.displayFormat?.radix);
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
