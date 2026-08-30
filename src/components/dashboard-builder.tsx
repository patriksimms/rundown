import {
  BarChart3Icon,
  CalendarDaysIcon,
  CaseUpperIcon,
  ChartNoAxesColumnIcon,
  ChevronLeftIcon,
  CircleGaugeIcon,
  GripVerticalIcon,
  LineChartIcon,
  ListFilterIcon,
  PencilIcon,
  PieChartIcon,
  PlusIcon,
  Settings2Icon,
  Table2Icon,
  Trash2Icon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import GridLayout, {
  noCompactor,
  useContainerWidth,
  type Layout,
  type LayoutItem,
} from 'react-grid-layout';
import { GridBackground } from 'react-grid-layout/extras';
import { callApi } from '#/api/client';
import { DashboardWidgetView, initialControlState } from '#/components/dashboard-view';
import { Alert, AlertDescription } from '#/components/ui/alert';
import { Button } from '#/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '#/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '#/components/ui/field';
import { Input } from '#/components/ui/input';
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select';
import { Popover, PopoverContent, PopoverTrigger } from '#/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '#/components/ui/sheet';
import { Textarea } from '#/components/ui/textarea';
import { cn } from '#/lib/utils';
import type {
  ControlState,
  Aggregation,
  DashboardDocument,
  DashboardWidget,
  FieldRole,
  SemanticType,
  WidgetDefinition,
} from '#/domain/schema';

export interface BuilderDataSource {
  id: string;
  name: string;
}

interface SourceField {
  id: string;
  label: string;
  canonicalName: string;
  role: FieldRole;
  semanticType: SemanticType;
  description?: string | null;
  columnName?: string;
  expression?: string;
  defaultAggregation?: Aggregation | null;
}

interface SourceDescription {
  id: string;
  name: string;
  fields: SourceField[];
  calculatedFields: SourceField[];
  libraryMetrics: Array<{
    id: string;
    name: string;
    expression: string;
    semanticType: SemanticType;
    description?: string | null;
  }>;
}

type BuilderType = WidgetDefinition['type'];

const catalog: Array<{
  type: BuilderType;
  label: string;
  icon: typeof BarChart3Icon;
  size: { width: number; height: number };
}> = [
  {
    type: 'scorecard',
    label: 'Scorecard',
    icon: ChartNoAxesColumnIcon,
    size: { width: 4, height: 3 },
  },
  { type: 'gauge', label: 'Gauge', icon: CircleGaugeIcon, size: { width: 4, height: 3 } },
  { type: 'line', label: 'Line chart', icon: LineChartIcon, size: { width: 8, height: 5 } },
  { type: 'bar', label: 'Bar chart', icon: BarChart3Icon, size: { width: 8, height: 5 } },
  { type: 'pie', label: 'Pie chart', icon: PieChartIcon, size: { width: 6, height: 5 } },
  { type: 'table', label: 'Table', icon: Table2Icon, size: { width: 8, height: 5 } },
  { type: 'control', label: 'Filter control', icon: ListFilterIcon, size: { width: 4, height: 2 } },
  {
    type: 'dateControl',
    label: 'Date control',
    icon: CalendarDaysIcon,
    size: { width: 4, height: 2 },
  },
  { type: 'text', label: 'Text', icon: CaseUpperIcon, size: { width: 6, height: 2 } },
];

export function DashboardBuilder({
  dashboard: initialDashboard,
  dataSources,
  refresh,
}: {
  dashboard: DashboardDocument;
  dataSources: BuilderDataSource[];
  refresh: () => Promise<void>;
}) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [selectedId, setSelectedId] = useState<string>();
  const [controlState, setControlState] = useState<ControlState>(() =>
    initialControlState(initialDashboard),
  );
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [chartRevision, setChartRevision] = useState(0);
  const draggedType = useRef<BuilderType | undefined>(undefined);
  const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true });

  useEffect(() => setDashboard(initialDashboard), [initialDashboard]);

  const layout = useMemo<Layout>(
    () =>
      dashboard.widgets.map((widget) => ({
        i: widget.id,
        x: widget.layout.x,
        y: widget.layout.y,
        w: widget.layout.width,
        h: widget.layout.height,
        minW: 2,
        minH: 2,
      })),
    [dashboard.widgets],
  );
  const selected = dashboard.widgets.find((widget) => widget.id === selectedId);

  async function saveLayout(next: Layout) {
    const byId = new Map(next.map((item) => [item.i, item]));
    const widgets = dashboard.widgets.map((widget) => {
      const item = byId.get(widget.id);
      return item
        ? {
            ...widget,
            layout: { x: item.x, y: item.y, width: item.w, height: item.h },
          }
        : widget;
    });
    setDashboard({ ...dashboard, widgets });
    setSaving(true);
    setError(undefined);
    try {
      await callApi({
        action: 'updateLayout',
        dashboardId: dashboard.id,
        placements: widgets.map((widget) => ({ widgetId: widget.id, placement: widget.layout })),
      });
    } catch (caught) {
      setDashboard(dashboard);
      setError(message(caught));
    } finally {
      setSaving(false);
    }
  }

  async function addWidget(type: BuilderType, dropped?: LayoutItem) {
    const entry = catalog.find((item) => item.type === type)!;
    setSaving(true);
    setError(undefined);
    try {
      const definition = await defaultDefinition(type, dataSources[0]);
      const result = await callApi<{ widget: DashboardWidget }>({
        action: 'addWidget',
        dashboardId: dashboard.id,
        definition,
        width: dropped?.w ?? entry.size.width,
        height: dropped?.h ?? entry.size.height,
      });
      const widget = dropped
        ? {
            ...result.widget,
            layout: { x: dropped.x, y: dropped.y, width: dropped.w, height: dropped.h },
          }
        : result.widget;
      const widgets = [...dashboard.widgets, widget];
      setDashboard({ ...dashboard, widgets });
      setSelectedId(widget.id);
      setMobileOpen(true);
      if (dropped)
        await callApi({
          action: 'updateLayout',
          dashboardId: dashboard.id,
          placements: widgets.map((item) => ({ widgetId: item.id, placement: item.layout })),
        });
      await refresh();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setSaving(false);
    }
  }

  async function updateWidget(widget: DashboardWidget, definition: WidgetDefinition) {
    const previous = dashboard;
    const widgets = dashboard.widgets.map((item) =>
      item.id === widget.id ? { ...item, definition } : item,
    );
    setDashboard({ ...dashboard, widgets });
    setSaving(true);
    setError(undefined);
    try {
      await callApi({
        action: 'updateWidget',
        dashboardId: dashboard.id,
        widgetId: widget.id,
        definition,
      });
      await refresh();
    } catch (caught) {
      setDashboard(previous);
      setError(message(caught));
    } finally {
      setSaving(false);
    }
  }

  async function removeWidget(widget: DashboardWidget) {
    setSaving(true);
    try {
      await callApi({ action: 'removeWidget', dashboardId: dashboard.id, widgetId: widget.id });
      setDashboard({
        ...dashboard,
        widgets: dashboard.widgets.filter((item) => item.id !== widget.id),
      });
      setSelectedId(undefined);
      await refresh();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setSaving(false);
    }
  }

  const sidebar = selected ? (
    <WidgetSettings
      dashboardId={dashboard.id}
      widget={selected}
      dataSources={dataSources}
      onBack={() => setSelectedId(undefined)}
      onChange={(definition) => updateWidget(selected, definition)}
      onLayoutChange={(placement) =>
        saveLayout(
          layout.map((item) =>
            item.i === selected.id
              ? {
                  ...item,
                  x: placement.x,
                  y: placement.y,
                  w: placement.width,
                  h: placement.height,
                }
              : item,
          ),
        )
      }
      onRemove={() => removeWidget(selected)}
    />
  ) : (
    <WidgetCatalog
      disabled={saving}
      onAdd={addWidget}
      onDragStart={(type) => {
        draggedType.current = type;
      }}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {saving ? 'Saving...' : 'Changes save automatically'}
        </p>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger render={<Button className="md:hidden" variant="outline" size="sm" />}>
            <Settings2Icon data-icon="inline-start" />
            {selected ? 'Widget settings' : 'Add widget'}
          </SheetTrigger>
          <SheetContent side="right" className="w-[min(92vw,24rem)] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{selected ? 'Widget settings' : 'Add widget'}</SheetTitle>
              <SheetDescription>
                Every builder action is available without drag and resize.
              </SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-6">{sidebar}</div>
          </SheetContent>
        </Sheet>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          <div
            ref={containerRef}
            className="relative hidden min-h-80 rounded-xl bg-muted/50 md:block"
          >
            {mounted ? (
              <>
                <GridBackground
                  width={width}
                  cols={12}
                  rowHeight={56}
                  margin={[8, 8]}
                  rows={Math.max(10, ...layout.map((item) => item.y + item.h + 2))}
                  color="var(--color-muted)"
                  borderRadius={6}
                />
                <GridLayout
                  width={width}
                  layout={layout}
                  compactor={noCompactor}
                  gridConfig={{ cols: 12, rowHeight: 56, margin: [8, 8] }}
                  dragConfig={{ handle: '.widget-drag-handle', threshold: 8 }}
                  resizeConfig={{ handles: ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] }}
                  dropConfig={{ enabled: true, defaultItem: { w: 4, h: 3 } }}
                  droppingItem={{ i: '__dropping__', x: 0, y: 0, w: 4, h: 3 }}
                  onDrop={(next, item) => {
                    const type = draggedType.current;
                    draggedType.current = undefined;
                    if (type && item) void addWidget(type, item);
                    else if (next.length === dashboard.widgets.length) void saveLayout(next);
                  }}
                  onDropDragOver={() => {
                    const entry = catalog.find((item) => item.type === draggedType.current);
                    return entry ? { w: entry.size.width, h: entry.size.height } : false;
                  }}
                  onDragStop={(next) => void saveLayout(next)}
                  onResizeStop={(next) => {
                    setChartRevision((value) => value + 1);
                    void saveLayout(next);
                  }}
                >
                  {dashboard.widgets.map((widget) => (
                    <div
                      key={widget.id}
                      className={cn(
                        'group overflow-hidden rounded-xl bg-card shadow-sm ring-1 ring-foreground/10',
                        selectedId === widget.id && 'ring-2 ring-primary',
                      )}
                      onClick={() => setSelectedId(widget.id)}
                    >
                      <button
                        type="button"
                        className="widget-drag-handle absolute top-2 left-1/2 z-10 -translate-x-1/2 rounded-md bg-background/90 p-1 opacity-0 shadow-sm ring-1 ring-foreground/10 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                        aria-label={`Move ${widgetLabel(widget)}`}
                      >
                        <GripVerticalIcon className="size-4" />
                      </button>
                      <div
                        key={`${widget.id}-${chartRevision}`}
                        className="h-full [&>[data-slot=card]]:h-full"
                      >
                        <DashboardWidgetView
                          dashboard={dashboard}
                          widget={widget}
                          controlState={controlState}
                          setControlState={setControlState}
                        />
                      </div>
                    </div>
                  ))}
                </GridLayout>
              </>
            ) : null}
          </div>
          <div className="flex flex-col gap-4 md:hidden">
            {[...dashboard.widgets]
              .sort(
                (left, right) => left.layout.y - right.layout.y || left.layout.x - right.layout.x,
              )
              .map((widget) => (
                <div key={widget.id} className="relative rounded-xl ring-1 ring-foreground/10">
                  <Button
                    className="absolute top-2 right-2 z-10"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedId(widget.id);
                      setMobileOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <DashboardWidgetView
                    dashboard={dashboard}
                    widget={widget}
                    controlState={controlState}
                    setControlState={setControlState}
                  />
                </div>
              ))}
          </div>
        </div>
        <aside className="sticky top-4 hidden max-h-[calc(100vh-2rem)] overflow-y-auto pr-1 md:block">
          {sidebar}
        </aside>
      </div>
    </div>
  );
}

function WidgetCatalog({
  disabled,
  onAdd,
  onDragStart,
}: {
  disabled: boolean;
  onAdd: (type: BuilderType) => Promise<void>;
  onDragStart: (type: BuilderType) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="font-medium">Widgets</h2>
        <p className="text-sm text-muted-foreground">Drag onto the grid or add at the bottom.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {catalog.map(({ type, label, icon: Icon }) => (
          <div
            key={type}
            draggable={!disabled}
            onDragStart={(event) => {
              onDragStart(type);
              event.dataTransfer.setData('text/plain', type);
              event.dataTransfer.effectAllowed = 'copy';
            }}
            className="group flex min-h-28 cursor-grab flex-col justify-between rounded-lg bg-card p-3 ring-1 ring-foreground/10 active:cursor-grabbing"
          >
            <WidgetPreview type={type} icon={Icon} />
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{label}</span>
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={disabled}
                aria-label={`Add ${label}`}
                onClick={() => void onAdd(type)}
              >
                <PlusIcon />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WidgetPreview({ type, icon: Icon }: { type: BuilderType; icon: typeof BarChart3Icon }) {
  return (
    <svg viewBox="0 0 120 48" className="h-12 w-full text-muted-foreground" aria-hidden="true">
      <rect
        x="1"
        y="1"
        width="118"
        height="46"
        rx="5"
        fill="none"
        stroke="currentColor"
        opacity=".25"
      />
      {['bar', 'line', 'pie'].includes(type) ? (
        <path
          d="M16 36 35 21 53 29 75 12 103 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        />
      ) : type === 'table' ? (
        <path d="M14 15h92M14 25h92M14 35h92M45 9v32M78 9v32" stroke="currentColor" opacity=".7" />
      ) : (
        <foreignObject x="43" y="8" width="34" height="34">
          <Icon className="size-8" />
        </foreignObject>
      )}
    </svg>
  );
}

function WidgetSettings({
  dashboardId,
  widget,
  dataSources,
  onBack,
  onChange,
  onLayoutChange,
  onRemove,
}: {
  dashboardId: string;
  widget: DashboardWidget;
  dataSources: BuilderDataSource[];
  onBack: () => void;
  onChange: (definition: WidgetDefinition) => Promise<void>;
  onLayoutChange: (placement: DashboardWidget['layout']) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [definition, setDefinition] = useState(widget.definition);
  const [source, setSource] = useState<SourceDescription>();
  const [sourceOpen, setSourceOpen] = useState(false);
  const [formulaOpen, setFormulaOpen] = useState(false);
  const [dimensionOpen, setDimensionOpen] = useState(false);
  useEffect(() => setDefinition(widget.definition), [widget]);
  useEffect(() => {
    if (!('dataSourceId' in definition)) return;
    void describeSource(definition.dataSourceId, dashboardId).then(setSource);
  }, [dashboardId, definition]);

  async function commit(next: WidgetDefinition) {
    setDefinition(next);
    await onChange(next);
  }

  const fields = [...(source?.fields ?? []), ...(source?.calculatedFields ?? [])];
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" aria-label="Back to widgets" onClick={onBack}>
          <ChevronLeftIcon />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-medium">{widgetLabel(widget)}</h2>
          <p className="text-xs text-muted-foreground">{definition.type}</p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Remove widget"
          onClick={() => void onRemove()}
        >
          <Trash2Icon />
        </Button>
      </div>
      {'title' in definition ? (
        <Field>
          <FieldLabel htmlFor={`title-${widget.id}`}>Title</FieldLabel>
          <Input
            id={`title-${widget.id}`}
            value={definition.title}
            onChange={(event) => setDefinition({ ...definition, title: event.target.value })}
            onBlur={() => void commit(definition)}
          />
        </Field>
      ) : null}
      {definition.type === 'text' ? (
        <Field>
          <FieldLabel htmlFor={`text-${widget.id}`}>Text</FieldLabel>
          <Textarea
            id={`text-${widget.id}`}
            value={plainText(definition.content.document)}
            onChange={(event) =>
              setDefinition({
                ...definition,
                content: { ...definition.content, document: event.target.value },
              })
            }
            onBlur={() => void commit(definition)}
          />
        </Field>
      ) : null}
      {'dataSourceId' in definition ? (
        <>
          <Field>
            <FieldLabel>Source</FieldLabel>
            <div className="flex gap-2">
              <NativeSelect
                value={definition.dataSourceId}
                onChange={(event) =>
                  void changeSource(definition, event.target.value, dashboardId, commit)
                }
              >
                {dataSources.map((item) => (
                  <NativeSelectOption key={item.id} value={item.id}>
                    {item.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <Button
                variant="outline"
                size="icon"
                aria-label="Edit datasource fields"
                onClick={() => setSourceOpen(true)}
              >
                <PencilIcon />
              </Button>
            </div>
          </Field>
          {definition.type === 'control' ? (
            <FieldPicker
              label="Field"
              value={definition.fieldId}
              fields={fields.filter((field) => field.role !== 'metric')}
              onChange={(fieldId) => void commit({ ...definition, fieldId })}
            />
          ) : (
            <>
              <FieldPicker
                label="Date field"
                value={definition.dateRangeFieldId}
                fields={fields.filter((field) => field.role === 'date')}
                onChange={(dateRangeFieldId) => void commit({ ...definition, dateRangeFieldId })}
              />
              <DimensionSettings definition={definition} fields={fields} commit={commit} />
              <MetricSettings
                definition={definition}
                fields={fields}
                source={source}
                commit={commit}
              />
              <FilterSettings definition={definition} fields={fields} commit={commit} />
              <TypeSettings definition={definition} fields={fields} commit={commit} />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setFormulaOpen(true)}>
                  <PlusIcon data-icon="inline-start" /> Metric
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDimensionOpen(true)}>
                  <PlusIcon data-icon="inline-start" /> Dimension
                </Button>
              </div>
            </>
          )}
          {source ? (
            <DatasourceDialog
              open={sourceOpen}
              onOpenChange={setSourceOpen}
              dashboardId={dashboardId}
              source={source}
              onRefresh={() => describeSource(source.id, dashboardId).then(setSource)}
            />
          ) : null}
          <MetricFormulaDialog
            open={formulaOpen}
            onOpenChange={setFormulaOpen}
            dashboardId={dashboardId}
            definition={definition}
            onSave={commit}
          />
          <CalculatedFieldDialog
            open={dimensionOpen}
            onOpenChange={setDimensionOpen}
            dashboardId={dashboardId}
            sourceId={definition.dataSourceId}
            onSaved={() => describeSource(definition.dataSourceId, dashboardId).then(setSource)}
          />
        </>
      ) : null}
      <FieldGroup className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor={`x-${widget.id}`}>Column</FieldLabel>
          <LayoutNumberInput
            id={`x-${widget.id}`}
            min={0}
            max={11}
            value={widget.layout.x}
            onCommit={(x) => onLayoutChange({ ...widget.layout, x })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`y-${widget.id}`}>Row</FieldLabel>
          <LayoutNumberInput
            id={`y-${widget.id}`}
            min={0}
            value={widget.layout.y}
            onCommit={(y) => onLayoutChange({ ...widget.layout, y })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`width-${widget.id}`}>Width</FieldLabel>
          <LayoutNumberInput
            id={`width-${widget.id}`}
            min={1}
            max={12}
            value={widget.layout.width}
            onCommit={(width) => onLayoutChange({ ...widget.layout, width })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`height-${widget.id}`}>Height</FieldLabel>
          <LayoutNumberInput
            id={`height-${widget.id}`}
            min={1}
            value={widget.layout.height}
            onCommit={(height) => onLayoutChange({ ...widget.layout, height })}
          />
        </Field>
        <FieldDescription className="col-span-2">
          Desktop also supports direct drag and resize.
        </FieldDescription>
      </FieldGroup>
    </div>
  );
}

function LayoutNumberInput({
  id,
  value,
  min,
  max,
  onCommit,
}: {
  id: string;
  value: number;
  min: number;
  max?: number;
  onCommit: (value: number) => Promise<void>;
}) {
  const [input, setInput] = useState(String(value));
  useEffect(() => setInput(String(value)), [value]);
  return (
    <Input
      id={id}
      type="number"
      min={min}
      max={max}
      value={input}
      onChange={(event) => setInput(event.target.value)}
      onBlur={() => {
        const next = Number(input);
        if (Number.isInteger(next) && next >= min && (max === undefined || next <= max))
          void onCommit(next);
        else setInput(String(value));
      }}
    />
  );
}

function DimensionSettings({ definition, fields, commit }: QuerySettingsProps) {
  if ('dimension' in definition)
    return (
      <FieldPicker
        label="Dimension"
        value={definition.dimension.fieldId}
        fields={fields}
        onChange={(fieldId) =>
          void commit({ ...definition, dimension: { ...definition.dimension, fieldId } })
        }
      />
    );
  if ('dimensions' in definition)
    return (
      <FieldPicker
        label="Dimension"
        value={definition.dimensions[0]?.fieldId ?? ''}
        fields={fields}
        onChange={(fieldId) =>
          void commit({
            ...definition,
            dimensions: [{ fieldId }, ...definition.dimensions.slice(1)],
          })
        }
      />
    );
  return null;
}

type MetricDefinition = Extract<WidgetDefinition, { type: 'scorecard' }>['metric'];

function MetricSettings({
  definition,
  fields,
  source,
  commit,
}: QuerySettingsProps & { source?: SourceDescription }) {
  const metric =
    'metric' in definition
      ? definition.metric
      : 'metrics' in definition
        ? definition.metrics[0]
        : undefined;
  if (!metric) return null;
  const value =
    metric.source.kind === 'field'
      ? metric.source.fieldId
      : metric.source.kind === 'library'
        ? metric.source.libraryMetricId
        : `expression:${metric.source.expression}`;
  const choices = [
    ...fields
      .filter((field) => field.role === 'metric')
      .map((field) => ({ id: field.id, label: field.label })),
    ...(source?.libraryMetrics ?? []).map((item) => ({
      id: item.id,
      label: `${item.name} · library`,
    })),
  ];
  function update(nextMetric: MetricDefinition) {
    if ('metric' in definition) return commit({ ...definition, metric: nextMetric });
    if ('metrics' in definition)
      return commit({ ...definition, metrics: [nextMetric, ...definition.metrics.slice(1)] });
  }
  return (
    <>
      <FieldPicker
        label="Metric"
        value={value}
        fields={choices}
        onChange={(id) => {
          const library = source?.libraryMetrics.find((item) => item.id === id);
          void update({
            ...metric,
            source: library
              ? { kind: 'library', libraryMetricId: id }
              : { kind: 'field', fieldId: id, aggregation: 'sum' },
          });
        }}
      />
      {metric.source.kind === 'field' ? (
        <Field>
          <FieldLabel>Aggregation</FieldLabel>
          <NativeSelect
            value={metric.source.aggregation}
            onChange={(event) =>
              void update({
                ...metric,
                source: {
                  kind: 'field',
                  fieldId: metric.source.kind === 'field' ? metric.source.fieldId : '',
                  aggregation: event.target.value as typeof metric.source.aggregation,
                },
              })
            }
          >
            {[
              'sum',
              'average',
              'count',
              'countDistinct',
              'min',
              'max',
              'median',
              'standardDeviation',
              'variance',
            ].map((item) => (
              <NativeSelectOption key={item} value={item}>
                {item}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      ) : null}
    </>
  );
}

type QueryDefinition = Extract<WidgetDefinition, { dataSourceId: string }>;
interface QuerySettingsProps {
  definition: QueryDefinition;
  fields: SourceField[];
  commit: (definition: WidgetDefinition) => Promise<void>;
}

function FilterSettings({ definition, fields, commit }: QuerySettingsProps) {
  const condition = definition.filter?.conditions[0];
  return (
    <div className="flex flex-col gap-2">
      <FieldLabel>Filter</FieldLabel>
      {condition ? (
        <>
          <FieldPicker
            label="Field"
            value={condition.fieldId}
            fields={fields}
            onChange={(fieldId) =>
              void commit({
                ...definition,
                filter: {
                  connector: definition.filter?.connector ?? 'and',
                  conditions: [{ ...condition, fieldId }],
                },
              })
            }
          />
          <NativeSelect
            value={condition.operator}
            onChange={(event) =>
              void commit({
                ...definition,
                filter: {
                  connector: definition.filter?.connector ?? 'and',
                  conditions: [
                    { ...condition, operator: event.target.value as typeof condition.operator },
                  ],
                },
              })
            }
          >
            {[
              'equals',
              'notEquals',
              'contains',
              'notContains',
              'greaterThan',
              'lessThan',
              'isEmpty',
              'isNotEmpty',
            ].map((item) => (
              <NativeSelectOption key={item} value={item}>
                {item}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {!['isEmpty', 'isNotEmpty'].includes(condition.operator) ? (
            <FilterValueInput
              value={String(condition.value ?? '')}
              onCommit={(value) =>
                commit({
                  ...definition,
                  filter: {
                    connector: definition.filter?.connector ?? 'and',
                    conditions: [{ ...condition, value }],
                  },
                })
              }
            />
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void commit({ ...definition, filter: undefined })}
          >
            Remove filter
          </Button>
        </>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            fields[0] &&
            void commit({
              ...definition,
              filter: {
                connector: 'and',
                conditions: [{ fieldId: fields[0].id, operator: 'equals', value: '' }],
              },
            })
          }
        >
          <PlusIcon data-icon="inline-start" /> Add filter
        </Button>
      )}
    </div>
  );
}

function FilterValueInput({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (value: string) => Promise<void>;
}) {
  const [input, setInput] = useState(value);
  useEffect(() => setInput(value), [value]);
  return (
    <Input
      value={input}
      placeholder="Value"
      onChange={(event) => setInput(event.target.value)}
      onBlur={() => void onCommit(input)}
    />
  );
}

function TypeSettings({ definition, fields, commit }: QuerySettingsProps) {
  return (
    <>
      {'comparison' in definition ? (
        <Field>
          <FieldLabel>Comparison</FieldLabel>
          <NativeSelect
            value={definition.comparison?.mode ?? 'none'}
            onChange={(event) =>
              void commit({
                ...definition,
                comparison: {
                  mode: event.target.value as 'none' | 'previousPeriod' | 'previousYear',
                },
              })
            }
          >
            <NativeSelectOption value="none">None</NativeSelectOption>
            <NativeSelectOption value="previousPeriod">Previous period</NativeSelectOption>
            <NativeSelectOption value="previousYear">Previous year</NativeSelectOption>
          </NativeSelect>
        </Field>
      ) : null}
      {'breakdownDimension' in definition ? (
        <FieldPicker
          label="Breakdown"
          value={definition.breakdownDimension?.fieldId ?? ''}
          fields={[{ id: '', label: 'None' }, ...fields]}
          onChange={(fieldId) =>
            void commit({ ...definition, breakdownDimension: fieldId ? { fieldId } : undefined })
          }
        />
      ) : null}
      {'limit' in definition ? (
        <Field>
          <FieldLabel>Limit</FieldLabel>
          <Input
            type="number"
            min={1}
            max={500}
            value={definition.limit ?? 20}
            onChange={(event) => void commit({ ...definition, limit: event.target.valueAsNumber })}
          />
        </Field>
      ) : null}
      {'sort' in definition ? (
        <Field>
          <FieldLabel>Sort</FieldLabel>
          <NativeSelect
            value={definition.sort?.[0]?.direction ?? 'desc'}
            onChange={(event) =>
              void commit({
                ...definition,
                sort: [
                  {
                    target: { kind: 'metric', index: 0 },
                    direction: event.target.value as 'asc' | 'desc',
                  },
                ],
              })
            }
          >
            <NativeSelectOption value="desc">Highest first</NativeSelectOption>
            <NativeSelectOption value="asc">Lowest first</NativeSelectOption>
          </NativeSelect>
        </Field>
      ) : null}
    </>
  );
}

function FieldPicker({
  label,
  value,
  fields,
  onChange,
}: {
  label: string;
  value: string;
  fields: Array<{ id: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = fields.find((field) => field.id === value);
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={<Button variant="outline" className="w-full justify-between font-normal" />}
        >
          <span className="truncate">
            {selected?.label ?? `Select ${label.toLocaleLowerCase()}`}
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-(--anchor-width) p-0" align="start">
          <Command>
            <CommandInput placeholder={`Search ${label.toLocaleLowerCase()}...`} />
            <CommandList>
              <CommandEmpty>No matching field.</CommandEmpty>
              <CommandGroup>
                {fields.map((field) => (
                  <CommandItem
                    key={field.id || 'empty'}
                    value={`${field.label} ${field.id}`}
                    data-checked={field.id === value}
                    onSelect={() => {
                      onChange(field.id);
                      setOpen(false);
                    }}
                  >
                    {field.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </Field>
  );
}

function DatasourceDialog({
  open,
  onOpenChange,
  dashboardId,
  source,
  onRefresh,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboardId: string;
  source: SourceDescription;
  onRefresh: () => Promise<void>;
}) {
  const [newFieldOpen, setNewFieldOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{source.name} fields</DialogTitle>
          <DialogDescription>
            Editors can change labels, roles, types, and descriptions. Hiding, casting, and
            canonical names remain admin-only.
          </DialogDescription>
        </DialogHeader>
        <Button
          className="justify-self-start"
          variant="outline"
          size="sm"
          onClick={() => setNewFieldOpen(true)}
        >
          <PlusIcon data-icon="inline-start" /> New field
        </Button>
        <div className="flex flex-col gap-2">
          {[...source.fields, ...source.calculatedFields].map((field) => (
            <DatasourceFieldRow
              key={field.id}
              field={field}
              sourceId={source.id}
              dashboardId={dashboardId}
              onSaved={onRefresh}
            />
          ))}
        </div>
        {source.libraryMetrics.length ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Library metrics</h3>
            {source.libraryMetrics.map((metric) => (
              <div
                key={metric.id}
                className="grid gap-1 rounded-lg bg-muted p-3 sm:grid-cols-[12rem_1fr]"
              >
                <span className="font-medium">{metric.name}</span>
                <code className="text-xs">{metric.expression}</code>
              </div>
            ))}
          </div>
        ) : null}
        <CalculatedFieldDialog
          open={newFieldOpen}
          onOpenChange={setNewFieldOpen}
          dashboardId={dashboardId}
          sourceId={source.id}
          onSaved={onRefresh}
        />
      </DialogContent>
    </Dialog>
  );
}

function DatasourceFieldRow({
  field,
  sourceId,
  dashboardId,
  onSaved,
}: {
  field: SourceField;
  sourceId: string;
  dashboardId: string;
  onSaved: () => Promise<void>;
}) {
  const [value, setValue] = useState(field);
  async function save() {
    if (field.columnName)
      await callApi({
        action: 'updateFieldMetadata',
        dashboardId,
        dataSourceId: sourceId,
        columnName: field.columnName,
        patch: {
          label: value.label,
          role: value.role,
          semanticType: value.semanticType,
          defaultAggregation: value.defaultAggregation ?? null,
          description: value.description ?? null,
        },
      });
    else if (field.expression)
      await callApi({
        action: 'upsertCalculatedField',
        dashboardId,
        dataSourceId: sourceId,
        id: field.id,
        name: value.label,
        canonicalName: value.canonicalName,
        expression: field.expression,
        role: value.role,
        semanticType: value.semanticType,
        defaultAggregation: value.defaultAggregation ?? null,
        description: value.description ?? undefined,
      });
    await onSaved();
  }
  return (
    <div className="grid items-end gap-2 rounded-lg bg-muted p-3 sm:grid-cols-[minmax(8rem,1fr)_8rem_9rem_9rem_minmax(10rem,1fr)_auto]">
      <Field>
        <FieldLabel>Name</FieldLabel>
        <Input
          value={value.label}
          onChange={(event) => setValue({ ...value, label: event.target.value })}
        />
      </Field>
      <Field>
        <FieldLabel>Role</FieldLabel>
        <NativeSelect
          value={value.role}
          onChange={(event) => setValue({ ...value, role: event.target.value as FieldRole })}
        >
          {['dimension', 'metric', 'date', 'id'].map((item) => (
            <NativeSelectOption key={item} value={item}>
              {item}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel>Type</FieldLabel>
        <NativeSelect
          value={value.semanticType}
          onChange={(event) =>
            setValue({ ...value, semanticType: event.target.value as SemanticType })
          }
        >
          {['currency', 'count', 'ratio', 'text', 'date', 'id'].map((item) => (
            <NativeSelectOption key={item} value={item}>
              {item}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel>Aggregation</FieldLabel>
        <NativeSelect
          disabled={value.role !== 'metric'}
          value={value.defaultAggregation ?? ''}
          onChange={(event) =>
            setValue({
              ...value,
              defaultAggregation: event.target.value ? (event.target.value as Aggregation) : null,
            })
          }
        >
          <NativeSelectOption value="">None</NativeSelectOption>
          {[
            'sum',
            'average',
            'count',
            'countDistinct',
            'min',
            'max',
            'median',
            'standardDeviation',
            'variance',
          ].map((item) => (
            <NativeSelectOption key={item} value={item}>
              {item}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel>Description</FieldLabel>
        <Input
          value={value.description ?? ''}
          onChange={(event) => setValue({ ...value, description: event.target.value })}
        />
      </Field>
      <Button variant="outline" size="sm" onClick={() => void save()}>
        Save
      </Button>
    </div>
  );
}

function MetricFormulaDialog({
  open,
  onOpenChange,
  dashboardId,
  definition,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboardId: string;
  definition: QueryDefinition;
  onSave: (definition: WidgetDefinition) => Promise<void>;
}) {
  const [name, setName] = useState('Custom metric');
  const [expression, setExpression] = useState('');
  const [saveLibrary, setSaveLibrary] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const metric = {
      source: { kind: 'expression' as const, expression },
      userDefinedName: name,
      dataType: 'number' as const,
    };
    const next =
      'metric' in definition
        ? { ...definition, metric }
        : 'metrics' in definition
          ? { ...definition, metrics: [...definition.metrics, metric] }
          : definition;
    await callApi({ action: 'previewWidget', dashboardId, definition: next });
    if (saveLibrary)
      await callApi({
        action: 'upsertLibraryMetric',
        dashboardId,
        name,
        expression,
        semanticType: 'ratio',
      });
    await onSave(next);
    onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add metric</DialogTitle>
          <DialogDescription>
            Rundown previews the expression before saving the widget.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel>Name</FieldLabel>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel>Aggregate expression</FieldLabel>
              <Textarea
                value={expression}
                onChange={(event) => setExpression(event.target.value)}
                placeholder={'SUM("MediaCost") / SUM("Impressions")'}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={saveLibrary}
                onChange={(event) => setSaveLibrary(event.target.checked)}
              />{' '}
              Save to workspace library
            </label>
            <Button type="submit" disabled={!name.trim() || !expression.trim()}>
              Preview and add
            </Button>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CalculatedFieldDialog({
  open,
  onOpenChange,
  dashboardId,
  sourceId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboardId: string;
  sourceId: string;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [expression, setExpression] = useState('');
  const [role, setRole] = useState<'dimension' | 'metric'>('dimension');
  async function submit(event: FormEvent) {
    event.preventDefault();
    await callApi({
      action: 'upsertCalculatedField',
      dashboardId,
      dataSourceId: sourceId,
      name,
      expression,
      role,
      semanticType: role === 'metric' ? 'count' : 'text',
      defaultAggregation: role === 'metric' ? 'sum' : null,
    });
    await onSaved();
    onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add calculated field</DialogTitle>
          <DialogDescription>
            This creates a reusable row-level field on the selected datasource.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel>Name</FieldLabel>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel>Expression</FieldLabel>
              <Textarea
                value={expression}
                onChange={(event) => setExpression(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Role</FieldLabel>
              <NativeSelect
                value={role}
                onChange={(event) => setRole(event.target.value as typeof role)}
              >
                <NativeSelectOption value="dimension">Dimension</NativeSelectOption>
                <NativeSelectOption value="metric">Metric</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Button type="submit" disabled={!name.trim() || !expression.trim()}>
              Create dimension
            </Button>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}

async function defaultDefinition(
  type: BuilderType,
  source?: BuilderDataSource,
): Promise<WidgetDefinition> {
  if (type === 'dateControl') return { type };
  if (type === 'text')
    return { type, content: { schemaVersion: 'plain-text-v1', document: 'Add text' } };
  if (!source) throw new Error('Register a datasource before adding a data widget.');
  const description = await describeSource(source.id);
  const fields = [...description.fields, ...description.calculatedFields];
  const date = fields.find((field) => field.role === 'date');
  const dimension = fields.find((field) => field.role === 'dimension' || field.role === 'id');
  const metricField = fields.find((field) => field.role === 'metric');
  if (type === 'control') {
    if (!dimension) throw new Error('This datasource has no dimension for a filter control.');
    return {
      type,
      dataSourceId: source.id,
      fieldId: dimension.id,
      userDefinedName: 'Filter',
      allowMultiple: true,
    };
  }
  if (!date || !metricField)
    throw new Error('The datasource needs a date field and a metric field.');
  const metric = {
    source: {
      kind: 'field' as const,
      fieldId: metricField.id,
      aggregation: metricField.defaultAggregation ?? 'sum',
    },
    dataType:
      metricField.semanticType === 'currency'
        ? ('currency' as const)
        : metricField.semanticType === 'ratio'
          ? ('percent' as const)
          : ('number' as const),
  };
  const base = { title: `New ${type}`, dataSourceId: source.id, dateRangeFieldId: date.id };
  if (type === 'scorecard') return { ...base, type, metric };
  if (type === 'gauge') return { ...base, type, metric };
  if (!dimension) throw new Error('The datasource needs a dimension for this widget.');
  if (type === 'line')
    return { ...base, type, dimension: { fieldId: dimension.id }, metrics: [metric] };
  if (type === 'table')
    return {
      ...base,
      type,
      dimensions: [{ fieldId: dimension.id }],
      metrics: [metric],
      resultLimit: { mode: 'top', amount: 50 },
    };
  return { ...base, type, dimension: { fieldId: dimension.id }, metric, limit: 20 };
}

async function changeSource(
  definition: QueryDefinition,
  sourceId: string,
  dashboardId: string,
  commit: (definition: WidgetDefinition) => Promise<void>,
) {
  const source = await describeSource(sourceId, dashboardId);
  const fields = [...source.fields, ...source.calculatedFields];
  const date = fields.find((field) => field.role === 'date');
  const dimension = fields.find((field) => field.role === 'dimension' || field.role === 'id');
  const metricField = fields.find((field) => field.role === 'metric');
  if (definition.type === 'control') {
    if (!dimension) throw new Error('The datasource has no dimension.');
    return commit({ ...definition, dataSourceId: sourceId, fieldId: dimension.id });
  }
  if (!date || !metricField) throw new Error('The datasource needs a date field and metric field.');
  let next: QueryDefinition = { ...definition, dataSourceId: sourceId, dateRangeFieldId: date.id };
  if ('dimension' in next && dimension) next = { ...next, dimension: { fieldId: dimension.id } };
  if ('dimensions' in next && dimension)
    next = { ...next, dimensions: [{ fieldId: dimension.id }] };
  const metric = {
    source: {
      kind: 'field' as const,
      fieldId: metricField.id,
      aggregation: metricField.defaultAggregation ?? 'sum',
    },
    dataType: 'number' as const,
  };
  if ('metric' in next) next = { ...next, metric };
  if ('metrics' in next) next = { ...next, metrics: [metric] };
  return commit(next);
}

function describeSource(sourceId: string, dashboardId?: string) {
  return callApi<SourceDescription>({
    action: 'describeDatasource',
    dataSourceId: sourceId,
    dashboardId,
  });
}

function widgetLabel(widget: DashboardWidget) {
  if ('title' in widget.definition) return widget.definition.title;
  if (widget.definition.type === 'control') return widget.definition.userDefinedName ?? 'Filter';
  if (widget.definition.type === 'dateControl') return 'Date range';
  return 'Text';
}

function plainText(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
