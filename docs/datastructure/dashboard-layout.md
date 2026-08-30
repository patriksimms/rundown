# Dashboard layout

Widgets sit on a fixed column grid without overlap.

```yaml
Dashboard:
  id: string
  workspaceId: string
  name: string
  schemaVersion: integer
  timezone: string           # IANA name, default Europe/Berlin
  defaultDateRange: DateRange
  columns: integer           # default 12
  widgets: DashboardWidget[]
  createdBy: string
  createdAt: string
  updatedAt: string

DashboardWidget:
  id: string
  layout: GridPlacement
  definition: WidgetDefinition
  definitionHash: string     # sha256 over definition plus referenced calculated fields and library metrics

GridPlacement:
  x: integer        # zero-based column
  y: integer        # zero-based row
  width: integer    # grid columns
  height: integer   # grid rows

WidgetDefinition:
  oneOf:
    - ControlField
    - DateControlField
    - TextField
    - Card
```

## Constraints

- `x`, `y` are zero or greater; `width`, `height` are greater than zero; `x + width` is at most `columns`.
- Widgets do not overlap. The server rejects placements that would.
- Empty rows are allowed. Stored placements are never compacted automatically.
- Widget IDs stay stable across moves and resizes.
- `addWidget` accepts only `width` and `height` and appends at the bottom of the grid. `moveWidget` sets one placement. `updateLayout` replaces every placement in one validated write after an interactive drag or resize. Agents never compute coordinates when adding widgets.
- `definitionHash` is recomputed on every write and is the first component of the query cache key.
- The grid describes the desktop layout only. On narrow screens the viewer stacks widgets in a single column in grid order; nothing mobile-specific is stored.

## Minimal example

```yaml
id: campaign-overview
workspaceId: ws_esome
name: Campaign overview
schemaVersion: 2
timezone: Europe/Berlin
defaultDateRange:
  startDate:
    relative: { amount: 30, unit: day, direction: past, anchor: startOfDay }
  endDate:
    relative: { amount: 0, unit: day, direction: past, anchor: startOfDay }
columns: 12
widgets:
  - id: date
    layout: { x: 0, y: 0, width: 4, height: 1 }
    definition:
      type: dateControl

  - id: campaign-filter
    layout: { x: 4, y: 0, width: 4, height: 1 }
    definition:
      type: control
      dataSourceId: campaign-performance
      fieldId: campaign
      allowMultiple: true

  - id: spend-score
    layout: { x: 0, y: 1, width: 4, height: 2 }
    definition:
      type: scorecard
      title: Media cost
      dataSourceId: campaign-performance
      dateRangeFieldId: date_start
      metric:
        source: { kind: field, fieldId: media_cost, aggregation: sum }
        dataType: currency
        displayFormat: { radix: 2 }
      comparison: { mode: previousPeriod }

  - id: cpm-by-targeting
    layout: { x: 4, y: 1, width: 8, height: 4 }
    definition:
      type: table
      title: CPM by targeting
      dataSourceId: campaign-performance
      dateRangeFieldId: date_start
      dimensions:
        - fieldId: targeting
      metrics:
        - source: { kind: field, fieldId: impressions, aggregation: sum }
          dataType: number
        - source: { kind: library, libraryMetricId: cpm }
          dataType: currency
      resultLimit: { mode: top, amount: 20 }
      sort:
        - target: { kind: metric, index: 0 }
          direction: desc
```
