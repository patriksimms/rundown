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
import {
  clearControlValue,
  filterInputValue,
  filterValueFromInput,
  patchFilterCondition,
} from '#/domain/widget-editing';
import { remapWidgetDefinition } from '#/domain/remap';
import { replacePlainTextDocument, textDocument } from '#/domain/text-content';
import { withDefaultDateRange } from '#/domain/control-state';
import { createSerialQueue } from '#/domain/serial-queue';
import { rollbackFailedLayout } from '#/domain/layout';
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
  const [pendingOperations, setPendingOperations] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [chartRevision, setChartRevision] = useState(0);
  const [pendingWidgets, setPendingWidgets] = useState<Record<string, number>>({});
  const [desktop, setDesktop] = useState<boolean>();
  const dashboardRef = useRef(initialDashboard);
  const mutationQueueRef = useRef(createSerialQueue());
  const mutationRevisionRef = useRef(0);
  const draggedType = useRef<BuilderType | undefined>(undefined);
  const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true });
  const saving = pendingOperations > 0;

  useEffect(() => {
    dashboardRef.current = initialDashboard;
    setDashboard(initialDashboard);
  }, [initialDashboard]);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 48rem)');
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const dateControl = dashboard.widgets.find(
      (widget) => widget.definition.type === 'dateControl',
    );
    if (!dateControl || dateControl.definition.type !== 'dateControl') return;
    const defaultDateRange = dateControl.definition.defaultDateRange ?? dashboard.defaultDateRange;
    setControlState((current) => withDefaultDateRange(current, defaultDateRange));
  }, [dashboard.defaultDateRange, dashboard.widgets]);

  function updateDashboard(updater: (current: DashboardDocument) => DashboardDocument) {
    const next = updater(dashboardRef.current);
    dashboardRef.current = next;
    setDashboard(next);
    return next;
  }

  function enqueueMutation<T>(operation: () => Promise<T>) {
    return mutationQueueRef.current(operation);
  }

  function startSaving() {
    setPendingOperations((current) => current + 1);
  }

  function finishSaving() {
    setPendingOperations((current) => Math.max(0, current - 1));
  }

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
    const revision = ++mutationRevisionRef.current;
    const byId = new Map(next.map((item) => [item.i, item]));
    const previousLayouts = new Map(
      dashboardRef.current.widgets.map((widget) => [widget.id, widget.layout]),
    );
    const optimistic = updateDashboard((current) => ({
      ...current,
      widgets: current.widgets.map((widget) => {
        const item = byId.get(widget.id);
        return item
          ? {
              ...widget,
              layout: { x: item.x, y: item.y, width: item.w, height: item.h },
            }
          : widget;
      }),
    }));
    const optimisticLayouts = new Map(
      optimistic.widgets.map((widget) => [widget.id, widget.layout]),
    );
    startSaving();
    setError(undefined);
    try {
      await enqueueMutation(() => {
        const current = dashboardRef.current;
        return callApi({
          action: 'updateLayout',
          dashboardId: current.id,
          placements: current.widgets.map((widget) => ({
            widgetId: widget.id,
            placement: widget.layout,
          })),
        });
      });
      if (revision === mutationRevisionRef.current) {
        setError(undefined);
        await refresh();
      }
    } catch (caught) {
      if (revision === mutationRevisionRef.current)
        updateDashboard((current) => ({
          ...current,
          widgets: rollbackFailedLayout(current.widgets, previousLayouts, optimisticLayouts),
        }));
      if (revision === mutationRevisionRef.current) setError(message(caught));
    } finally {
      finishSaving();
    }
  }

  async function addWidget(type: BuilderType, dropped?: LayoutItem) {
    const entry = catalog.find((item) => item.type === type)!;
    let revision: number | undefined;
    startSaving();
    setError(undefined);
    try {
      const definition = await defaultDefinition(type, dataSources[0]);
      revision = ++mutationRevisionRef.current;
      const result = await enqueueMutation(() =>
        callApi<{ widget: DashboardWidget }>({
          action: 'addWidget',
          dashboardId: dashboardRef.current.id,
          definition,
          width: dropped?.w ?? entry.size.width,
          height: dropped?.h ?? entry.size.height,
        }),
      );
      const widget = result.widget;
      const next = updateDashboard((current) => ({
        ...current,
        widgets: current.widgets.some((item) => item.id === widget.id)
          ? current.widgets
          : [...current.widgets, widget],
      }));
      setSelectedId(widget.id);
      setMobileOpen(true);
      if (dropped)
        await saveLayout(
          next.widgets.map((item) => ({
            i: item.id,
            x: item.id === widget.id ? dropped.x : item.layout.x,
            y: item.id === widget.id ? dropped.y : item.layout.y,
            w: item.id === widget.id ? dropped.w : item.layout.width,
            h: item.id === widget.id ? dropped.h : item.layout.height,
          })),
        );
      else if (revision === mutationRevisionRef.current) {
        setError(undefined);
        await refresh();
      }
    } catch (caught) {
      if (revision === undefined || revision === mutationRevisionRef.current)
        setError(message(caught));
    } finally {
      finishSaving();
    }
  }

  async function updateWidget(widget: DashboardWidget, definition: WidgetDefinition) {
    const revision = ++mutationRevisionRef.current;
    const previous = widget;
    const controlFieldChanged =
      widget.definition.type === 'control' &&
      definition.type === 'control' &&
      (widget.definition.dataSourceId !== definition.dataSourceId ||
        widget.definition.fieldId !== definition.fieldId);
    const previousControlValues = controlState.values?.[widget.id];
    if (controlFieldChanged) setControlState((current) => clearControlValue(current, widget.id));
    updateDashboard((current) => ({
      ...current,
      widgets: current.widgets.map((item) =>
        item.id === widget.id ? { ...item, definition } : item,
      ),
    }));
    setPendingWidgets((current) => ({
      ...current,
      [widget.id]: (current[widget.id] ?? 0) + 1,
    }));
    startSaving();
    setError(undefined);
    try {
      const result = await enqueueMutation(() =>
        callApi<{ widget: DashboardWidget }>({
          action: 'updateWidget',
          dashboardId: dashboardRef.current.id,
          widgetId: widget.id,
          definition,
        }),
      );
      updateDashboard((current) => ({
        ...current,
        widgets: current.widgets.map((item) =>
          item.id === widget.id && item.definition === definition
            ? {
                ...item,
                definition: result.widget.definition,
                definitionHash: result.widget.definitionHash,
              }
            : item,
        ),
      }));
      if (revision === mutationRevisionRef.current) {
        setError(undefined);
        await refresh();
      }
    } catch (caught) {
      if (
        controlFieldChanged &&
        dashboardRef.current.widgets.find((item) => item.id === widget.id)?.definition ===
          definition
      )
        setControlState((current) => {
          if ((current.values?.[widget.id]?.length ?? 0) > 0) return current;
          const values = { ...current.values };
          if (previousControlValues) values[widget.id] = previousControlValues;
          else delete values[widget.id];
          return { ...current, values: Object.keys(values).length ? values : undefined };
        });
      updateDashboard((current) => ({
        ...current,
        widgets: current.widgets.map((item) =>
          item.id === widget.id && item.definition === definition
            ? {
                ...item,
                definition: previous.definition,
                definitionHash: previous.definitionHash,
              }
            : item,
        ),
      }));
      if (revision === mutationRevisionRef.current) setError(message(caught));
    } finally {
      setPendingWidgets((current) => {
        const next = (current[widget.id] ?? 1) - 1;
        if (next > 0) return { ...current, [widget.id]: next };
        const { [widget.id]: _removed, ...rest } = current;
        return rest;
      });
      finishSaving();
    }
  }

  async function removeWidget(widget: DashboardWidget) {
    const revision = ++mutationRevisionRef.current;
    startSaving();
    setError(undefined);
    try {
      await enqueueMutation(() =>
        callApi({
          action: 'removeWidget',
          dashboardId: dashboardRef.current.id,
          widgetId: widget.id,
        }),
      );
      updateDashboard((current) => ({
        ...current,
        widgets: current.widgets.filter((item) => item.id !== widget.id),
      }));
      setSelectedId(undefined);
      if (revision === mutationRevisionRef.current) {
        setError(undefined);
        await refresh();
      }
    } catch (caught) {
      if (revision === mutationRevisionRef.current) setError(message(caught));
    } finally {
      finishSaving();
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
  const settingsPanel = (
    <fieldset disabled={saving} className="min-w-0 border-0 p-0">
      {sidebar}
    </fieldset>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {saving ? 'Saving...' : 'Changes save automatically'}
        </p>
        {desktop === false ? (
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger render={<Button variant="outline" size="sm" />}>
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
              <div className="px-4 pb-6">{settingsPanel}</div>
            </SheetContent>
          </Sheet>
        ) : null}
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          {desktop ? (
            <div ref={containerRef} className="relative min-h-80 rounded-xl bg-muted/50">
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
                    dragConfig={{ enabled: !saving, handle: '.widget-drag-handle', threshold: 8 }}
                    resizeConfig={{
                      enabled: !saving,
                      handles: ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'],
                    }}
                    dropConfig={{ enabled: !saving, defaultItem: { w: 4, h: 3 } }}
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
                            preview={Boolean(pendingWidgets[widget.id])}
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
          ) : null}
          {desktop === false ? (
            <div className="flex flex-col gap-4">
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
                      preview={Boolean(pendingWidgets[widget.id])}
                      controlState={controlState}
                      setControlState={setControlState}
                    />
                  </div>
                ))}
            </div>
          ) : null}
        </div>
        {desktop ? (
          <aside className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto pr-1">
            {settingsPanel}
          </aside>
        ) : null}
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
  const [settingsError, setSettingsError] = useState<string>();
  const sourceRequestRef = useRef(0);
  const sourceId = 'dataSourceId' in definition ? definition.dataSourceId : undefined;
  useEffect(() => {
    sourceRequestRef.current += 1;
    setDefinition(widget.definition);
    setSettingsError(undefined);
  }, [widget]);
  useEffect(() => {
    if (!sourceId) return;
    const currentSourceId = sourceId;
    let current = true;
    async function loadSource() {
      try {
        const next = await describeSource(currentSourceId, dashboardId);
        if (current) setSource(next);
      } catch (caught) {
        if (current) setSettingsError(message(caught));
      }
    }
    void loadSource();
    return () => {
      current = false;
    };
  }, [dashboardId, sourceId]);

  async function commit(next: WidgetDefinition) {
    setDefinition(next);
    await onChange(next);
  }

  async function selectSource(dataSourceId: string) {
    if (!('dataSourceId' in definition)) return;
    const request = ++sourceRequestRef.current;
    setSettingsError(undefined);
    try {
      const next = await changeSource(definition, dataSourceId, dashboardId);
      if (request === sourceRequestRef.current) await commit(next);
    } catch (caught) {
      if (request === sourceRequestRef.current) setSettingsError(message(caught));
    }
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
      {settingsError ? (
        <Alert variant="destructive">
          <AlertDescription>{settingsError}</AlertDescription>
        </Alert>
      ) : null}
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
            value={textDocument(definition.content.document)}
            readOnly={typeof definition.content.document !== 'string'}
            onChange={(event) =>
              typeof definition.content.document === 'string' &&
              setDefinition({
                ...definition,
                content: {
                  ...definition.content,
                  document: replacePlainTextDocument(
                    definition.content.document,
                    event.target.value,
                  ),
                },
              })
            }
            onBlur={() => {
              if (typeof definition.content.document === 'string') void commit(definition);
            }}
          />
          {typeof definition.content.document !== 'string' ? (
            <FieldDescription>
              Structured text is read-only here so its document format stays intact.
            </FieldDescription>
          ) : null}
        </Field>
      ) : null}
      {'dataSourceId' in definition ? (
        <>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <FieldPicker
                label="Source"
                value={definition.dataSourceId}
                fields={dataSources.map((item) => ({ id: item.id, label: item.name }))}
                onChange={(dataSourceId) => void selectSource(dataSourceId)}
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              aria-label="Edit datasource fields"
              onClick={() => setSourceOpen(true)}
            >
              <PencilIcon />
            </Button>
          </div>
          {definition.type === 'control' ? (
            <FieldPicker
              label="Field"
              value={definition.fieldId}
              fields={fields.filter((field) => field.role !== 'metric')}
              onChange={(fieldId) =>
                void commit({ ...definition, fieldId, defaultValues: undefined })
              }
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
                  <PlusIcon data-icon="inline-start" /> Custom metric
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDimensionOpen(true)}>
                  <PlusIcon data-icon="inline-start" /> New field
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
  const dimensions = fields.filter((field) => field.role !== 'metric' && field.role !== 'date');
  if ('dimension' in definition)
    return (
      <FieldPicker
        label="Dimension"
        value={definition.dimension.fieldId}
        fields={dimensions}
        onChange={(fieldId) =>
          void commit({ ...definition, dimension: { ...definition.dimension, fieldId } })
        }
      />
    );
  if ('dimensions' in definition)
    return (
      <div className="flex flex-col gap-3">
        {definition.dimensions.map((dimension, index) => (
          <div key={`${dimension.fieldId}-${index}`} className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <FieldPicker
                label={`Dimension ${index + 1}`}
                value={dimension.fieldId}
                fields={dimensions}
                onChange={(fieldId) =>
                  void commit({
                    ...definition,
                    dimensions: definition.dimensions.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, fieldId } : item,
                    ),
                  })
                }
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove dimension ${index + 1}`}
              onClick={() =>
                void commit({
                  ...definition,
                  dimensions: definition.dimensions.filter((_, itemIndex) => itemIndex !== index),
                })
              }
            >
              <Trash2Icon />
            </Button>
          </div>
        ))}
        <FieldPicker
          label="Add dimension"
          value=""
          fields={dimensions}
          onChange={(fieldId) =>
            void commit({
              ...definition,
              dimensions: [...definition.dimensions, { fieldId }],
            })
          }
        />
      </div>
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
  const choices = [
    ...fields
      .filter((field) => field.role === 'metric')
      .map((field) => ({ id: field.id, label: field.label })),
    ...(source?.libraryMetrics ?? []).map((item) => ({
      id: item.id,
      label: `${item.name} · library`,
    })),
  ];
  const metrics =
    'metric' in definition
      ? [definition.metric]
      : 'metrics' in definition
        ? definition.metrics
        : [];
  if (!metrics.length) return null;
  function update(index: number, nextMetric: MetricDefinition) {
    if ('metric' in definition) return commit({ ...definition, metric: nextMetric });
    if ('metrics' in definition)
      return commit({
        ...definition,
        metrics: definition.metrics.map((item, itemIndex) =>
          itemIndex === index ? nextMetric : item,
        ),
      });
    return Promise.resolve();
  }
  function metricFor(id: string): MetricDefinition {
    const library = source?.libraryMetrics.find((item) => item.id === id);
    const field = fields.find((item) => item.id === id);
    return {
      source: library
        ? { kind: 'library', libraryMetricId: id }
        : {
            kind: 'field',
            fieldId: id,
            aggregation: field?.defaultAggregation ?? 'sum',
          },
      dataType:
        (field?.semanticType ?? library?.semanticType) === 'currency'
          ? 'currency'
          : (field?.semanticType ?? library?.semanticType) === 'ratio'
            ? 'percent'
            : 'number',
    };
  }
  return (
    <div className="flex flex-col gap-3">
      {metrics.map((metric, index) => {
        const value =
          metric.source.kind === 'field'
            ? metric.source.fieldId
            : metric.source.kind === 'library'
              ? metric.source.libraryMetricId
              : `expression:${index}`;
        const metricChoices =
          metric.source.kind === 'expression'
            ? [{ id: value, label: metric.userDefinedName ?? 'Custom expression' }, ...choices]
            : choices;
        return (
          <div key={`${value}-${index}`} className="flex flex-col gap-2">
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <FieldPicker
                  label={`Metric${metrics.length > 1 ? ` ${index + 1}` : ''}`}
                  value={value}
                  fields={metricChoices}
                  onChange={(id) => {
                    if (id !== value) void update(index, metricFor(id));
                  }}
                />
              </div>
              {'metrics' in definition && definition.metrics.length > 1 ? (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove metric ${index + 1}`}
                  onClick={() =>
                    void commit({
                      ...definition,
                      metrics: definition.metrics.filter((_, itemIndex) => itemIndex !== index),
                    })
                  }
                >
                  <Trash2Icon />
                </Button>
              ) : null}
            </div>
            {metric.source.kind === 'field' ? (
              <Field>
                <FieldLabel>Aggregation</FieldLabel>
                <NativeSelect
                  value={metric.source.aggregation}
                  onChange={(event) =>
                    void update(index, {
                      ...metric,
                      source: {
                        kind: 'field',
                        fieldId: metric.source.kind === 'field' ? metric.source.fieldId : '',
                        aggregation: event.target.value as Aggregation,
                      },
                    })
                  }
                >
                  {aggregations.map((item) => (
                    <NativeSelectOption key={item} value={item}>
                      {item}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            ) : null}
            {metric.source.kind === 'expression' ? (
              <MetricExpressionInput
                metric={metric}
                onCommit={(nextMetric) => update(index, nextMetric)}
              />
            ) : null}
          </div>
        );
      })}
      {'metrics' in definition ? (
        <FieldPicker
          label="Add metric"
          value=""
          fields={choices}
          onChange={(id) =>
            void commit({ ...definition, metrics: [...definition.metrics, metricFor(id)] })
          }
        />
      ) : null}
    </div>
  );
}

const aggregations: Aggregation[] = [
  'sum',
  'average',
  'count',
  'countDistinct',
  'min',
  'max',
  'median',
  'standardDeviation',
  'variance',
];

function MetricExpressionInput({
  metric,
  onCommit,
}: {
  metric: MetricDefinition;
  onCommit: (metric: MetricDefinition) => Promise<void>;
}) {
  const source = metric.source.kind === 'expression' ? metric.source : undefined;
  const [name, setName] = useState(metric.userDefinedName ?? '');
  const [expression, setExpression] = useState(source?.expression ?? '');
  useEffect(() => {
    setName(metric.userDefinedName ?? '');
    setExpression(source?.expression ?? '');
  }, [metric.userDefinedName, source?.expression]);
  if (!source) return null;
  const save = () =>
    onCommit({
      ...metric,
      userDefinedName: name.trim() || undefined,
      source: { kind: 'expression', expression },
    });
  return (
    <div className="grid gap-2">
      <Field>
        <FieldLabel>Name</FieldLabel>
        <Input value={name} onChange={(event) => setName(event.target.value)} onBlur={save} />
      </Field>
      <Field>
        <FieldLabel>Expression</FieldLabel>
        <Textarea
          value={expression}
          onChange={(event) => setExpression(event.target.value)}
          onBlur={save}
        />
      </Field>
    </div>
  );
}

type QueryDefinition = Extract<WidgetDefinition, { dataSourceId: string }>;
interface QuerySettingsProps {
  definition: QueryDefinition;
  fields: SourceField[];
  commit: (definition: WidgetDefinition) => Promise<void>;
}

function FilterSettings({ definition, fields, commit }: QuerySettingsProps) {
  const filter = definition.filter;
  const conditions = filter?.conditions ?? [];
  function updateCondition(index: number, patch: Partial<(typeof conditions)[number]>) {
    const currentFilter = filter ?? { connector: 'and' as const, conditions };
    return commit({
      ...definition,
      filter: patchFilterCondition(currentFilter, index, patch),
    });
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <FieldLabel>Filters</FieldLabel>
        {conditions.length > 1 ? (
          <NativeSelect
            className="w-24"
            aria-label="Filter connector"
            value={filter?.connector ?? 'and'}
            onChange={(event) =>
              void commit({
                ...definition,
                filter: {
                  connector: event.target.value as 'and' | 'or',
                  conditions,
                },
              })
            }
          >
            <NativeSelectOption value="and">Match all</NativeSelectOption>
            <NativeSelectOption value="or">Match any</NativeSelectOption>
          </NativeSelect>
        ) : null}
      </div>
      {conditions.map((condition, index) => (
        <div key={`${condition.fieldId}-${index}`} className="grid gap-2 border-l-2 pl-3">
          <FieldPicker
            label={`Filter ${index + 1}`}
            value={condition.fieldId}
            fields={fields}
            onChange={(fieldId) => void updateCondition(index, { fieldId })}
          />
          <NativeSelect
            aria-label={`Filter ${index + 1} operator`}
            value={condition.operator}
            onChange={(event) =>
              void updateCondition(index, {
                operator: event.target.value as typeof condition.operator,
              })
            }
          >
            {filterOperators.map((item) => (
              <NativeSelectOption key={item} value={item}>
                {item}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {!['isEmpty', 'isNotEmpty'].includes(condition.operator) ? (
            <FilterValueInput
              value={filterInputValue(
                condition.value,
                condition.operator === 'in' || condition.operator === 'notIn',
              )}
              onCommit={(value) =>
                updateCondition(index, {
                  value: filterValueFromInput(
                    value,
                    condition.operator === 'in' || condition.operator === 'notIn',
                  ),
                })
              }
            />
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const next = conditions.filter((_, itemIndex) => itemIndex !== index);
              void commit({
                ...definition,
                filter: next.length
                  ? { connector: filter?.connector ?? 'and', conditions: next }
                  : undefined,
              });
            }}
          >
            Remove filter
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          fields[0] &&
          void commit({
            ...definition,
            filter: {
              connector: filter?.connector ?? 'and',
              conditions: [...conditions, { fieldId: fields[0].id, operator: 'equals', value: '' }],
            },
          })
        }
      >
        <PlusIcon data-icon="inline-start" /> Add filter
      </Button>
    </div>
  );
}

const filterOperators = [
  'equals',
  'notEquals',
  'contains',
  'notContains',
  'in',
  'notIn',
  'greaterThan',
  'greaterThanOrEqual',
  'lessThan',
  'lessThanOrEqual',
  'isEmpty',
  'isNotEmpty',
] as const;

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
  const dimensions = fields.filter((field) => field.role !== 'metric' && field.role !== 'date');
  switch (definition.type) {
    case 'scorecard':
    case 'line':
      return (
        <ComparisonSetting
          value={definition.comparison?.mode ?? 'none'}
          onChange={(mode) => commit({ ...definition, comparison: { mode } })}
        />
      );
    case 'gauge':
      return (
        <>
          <ComparisonSetting
            value={definition.comparison?.mode ?? 'none'}
            onChange={(mode) => commit({ ...definition, comparison: { mode } })}
          />
          <Field>
            <FieldLabel>Upper limit</FieldLabel>
            <NativeSelect
              value={definition.upperLimit?.kind ?? 'none'}
              onChange={(event) =>
                void commit({
                  ...definition,
                  upperLimit:
                    event.target.value === 'manual' ? { kind: 'manual', value: 100 } : undefined,
                })
              }
            >
              <NativeSelectOption value="none">Automatic</NativeSelectOption>
              <NativeSelectOption value="manual">Manual</NativeSelectOption>
            </NativeSelect>
          </Field>
          {definition.upperLimit?.kind === 'manual' ? (
            <Field>
              <FieldLabel htmlFor="gauge-upper-limit">Maximum</FieldLabel>
              <LayoutNumberInput
                id="gauge-upper-limit"
                min={1}
                value={definition.upperLimit.value}
                onCommit={(value) =>
                  commit({ ...definition, upperLimit: { kind: 'manual', value } })
                }
              />
            </Field>
          ) : null}
        </>
      );
    case 'bar':
      return (
        <>
          <ComparisonSetting
            value={definition.comparison?.mode ?? 'none'}
            onChange={(mode) => commit({ ...definition, comparison: { mode } })}
          />
          <BreakdownSetting
            value={definition.breakdownDimension?.fieldId ?? ''}
            fields={dimensions}
            onChange={(fieldId) =>
              commit({ ...definition, breakdownDimension: fieldId ? { fieldId } : undefined })
            }
          />
          <LimitSetting
            value={definition.limit ?? 20}
            onChange={(limit) => commit({ ...definition, limit })}
          />
          <SortSetting
            value={definition.sort?.[0]?.direction ?? 'desc'}
            onChange={(direction) =>
              commit({
                ...definition,
                sort: sortWithDirection(definition.sort, direction),
              })
            }
          />
        </>
      );
    case 'pie':
      return (
        <>
          <BreakdownSetting
            value={definition.breakdownDimension?.fieldId ?? ''}
            fields={dimensions}
            onChange={(fieldId) =>
              commit({ ...definition, breakdownDimension: fieldId ? { fieldId } : undefined })
            }
          />
          <LimitSetting
            value={definition.limit ?? 20}
            onChange={(limit) => commit({ ...definition, limit })}
          />
          <SortSetting
            value={definition.sort?.[0]?.direction ?? 'desc'}
            onChange={(direction) =>
              commit({
                ...definition,
                sort: sortWithDirection(definition.sort, direction),
              })
            }
          />
        </>
      );
    case 'table':
      return (
        <>
          <ComparisonSetting
            value={definition.comparison?.mode ?? 'none'}
            onChange={(mode) => commit({ ...definition, comparison: { mode } })}
          />
          <LimitSetting
            label="Result limit"
            value={definition.resultLimit.amount}
            onChange={(amount) =>
              commit({ ...definition, resultLimit: { ...definition.resultLimit, amount } })
            }
          />
          <SortSetting
            value={definition.sort?.[0]?.direction ?? 'desc'}
            onChange={(direction) =>
              commit({
                ...definition,
                sort: sortWithDirection(definition.sort, direction),
              })
            }
          />
        </>
      );
    default:
      return null;
  }
}

type ComparisonMode = 'none' | 'previousPeriod' | 'previousYear';

function ComparisonSetting({
  value,
  onChange,
}: {
  value: ComparisonMode;
  onChange: (value: ComparisonMode) => Promise<void>;
}) {
  return (
    <Field>
      <FieldLabel>Comparison</FieldLabel>
      <NativeSelect
        value={value}
        onChange={(event) => void onChange(event.target.value as ComparisonMode)}
      >
        <NativeSelectOption value="none">None</NativeSelectOption>
        <NativeSelectOption value="previousPeriod">Previous period</NativeSelectOption>
        <NativeSelectOption value="previousYear">Previous year</NativeSelectOption>
      </NativeSelect>
    </Field>
  );
}

function BreakdownSetting({
  value,
  fields,
  onChange,
}: {
  value: string;
  fields: SourceField[];
  onChange: (value: string) => Promise<void>;
}) {
  return (
    <FieldPicker
      label="Breakdown"
      value={value}
      fields={[{ id: '', label: 'None' }, ...fields]}
      onChange={(fieldId) => void onChange(fieldId)}
    />
  );
}

function LimitSetting({
  label = 'Limit',
  value,
  onChange,
}: {
  label?: string;
  value: number;
  onChange: (value: number) => Promise<void>;
}) {
  const id = `type-${label.toLocaleLowerCase().replaceAll(' ', '-')}`;
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <LayoutNumberInput id={id} min={1} max={500} value={value} onCommit={onChange} />
    </Field>
  );
}

function SortSetting({
  value,
  onChange,
}: {
  value: 'asc' | 'desc';
  onChange: (value: 'asc' | 'desc') => Promise<void>;
}) {
  return (
    <Field>
      <FieldLabel>Sort</FieldLabel>
      <NativeSelect
        value={value}
        onChange={(event) => void onChange(event.target.value as 'asc' | 'desc')}
      >
        <NativeSelectOption value="desc">Highest first</NativeSelectOption>
        <NativeSelectOption value="asc">Lowest first</NativeSelectOption>
      </NativeSelect>
    </Field>
  );
}

type SortDefinition = Extract<WidgetDefinition, { type: 'table' }>['sort'];

function sortWithDirection(sort: SortDefinition, direction: 'asc' | 'desc') {
  return [
    {
      ...(sort?.[0] ?? { target: { kind: 'metric' as const, index: 0 } }),
      direction,
    },
    ...(sort?.slice(1) ?? []),
  ];
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
  const [saveError, setSaveError] = useState<string>();
  const [savingField, setSavingField] = useState(false);
  const savingRef = useRef(false);
  async function save() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSavingField(true);
    setSaveError(undefined);
    try {
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
    } catch (caught) {
      setSaveError(message(caught));
    } finally {
      savingRef.current = false;
      setSavingField(false);
    }
  }
  return (
    <div
      className={cn(
        'grid items-end gap-2 border-l-4 bg-muted/60 p-3 sm:grid-cols-[minmax(8rem,1fr)_8rem_9rem_9rem_minmax(10rem,1fr)_auto]',
        fieldRoleStyles[value.role],
      )}
    >
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
          {aggregations.map((item) => (
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
      <Button variant="outline" size="sm" disabled={savingField} onClick={() => void save()}>
        {savingField ? 'Saving...' : 'Save'}
      </Button>
      {saveError ? <p className="text-sm text-destructive sm:col-span-full">{saveError}</p> : null}
    </div>
  );
}

const fieldRoleStyles: Record<FieldRole, string> = {
  dimension: 'border-l-blue-500',
  metric: 'border-l-emerald-500',
  date: 'border-l-amber-500',
  id: 'border-l-violet-500',
};

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
  const [dialogError, setDialogError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setDialogError(undefined);
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
    try {
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
    } catch (caught) {
      setDialogError(message(caught));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
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
            {dialogError ? (
              <Alert variant="destructive">
                <AlertDescription>{dialogError}</AlertDescription>
              </Alert>
            ) : null}
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
            <Button type="submit" disabled={submitting || !name.trim() || !expression.trim()}>
              {submitting ? 'Adding...' : 'Preview and add'}
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

async function changeSource(definition: QueryDefinition, sourceId: string, dashboardId: string) {
  const [currentSource, targetSource] = await Promise.all([
    describeSource(definition.dataSourceId, dashboardId),
    describeSource(sourceId, dashboardId),
  ]);
  const remapped = remapWidgetDefinition(definition, currentSource, sourceId, targetSource);
  return remapped.type === 'control' ? { ...remapped, defaultValues: undefined } : remapped;
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

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
