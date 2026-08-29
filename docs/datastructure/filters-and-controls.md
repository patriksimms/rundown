# Filters and controls

## Filter

A filter narrows one widget's query. Conditions are flat and joined by a single connector.

```yaml
Filter:
  conditions: FilterCondition[]
  connector: and | or        # default and

FilterCondition:
  fieldId: string
  operator: FilterOperator
  value?: unknown            # absent for isEmpty / isNotEmpty; array for in / notIn

FilterOperator:
  equals
  | notEquals
  | contains
  | notContains
  | in
  | notIn
  | greaterThan
  | greaterThanOrEqual
  | lessThan
  | lessThanOrEqual
  | isEmpty
  | isNotEmpty
```

`mode: include | exclude` from the whiteboard is folded into the negated operators. Nested groups are deferred.

## Control field

A control lets viewers pick values for one field. It publishes into the dashboard's control state and applies to widgets across datasources by canonical name (Looker Studio behavior).

```yaml
ControlField:
  type: control
  dataSourceId: string       # datasource used to load options
  fieldId: string
  userDefinedName?: string
  defaultValues?: unknown[]
  allowMultiple: boolean     # default true
  filter?: Filter            # narrows the option list, not the widgets
  optionsSortDirection?: asc | desc
  styling?: Styling
```

Matching rule: the control's field has a `canonicalName`. A widget is affected if its datasource has a field (column or calculated field) with the same `canonicalName` and a compatible type. Widgets without a match ignore the control. Matching happens server-side when resolving control state per widget.

Option loading (`getControlOptions`) groups the datasource by `fieldId`, applies `filter` and the active date range, and returns values. Options paginate and support a search term. `metricForOption` from the whiteboard is dropped.

## Date control field

```yaml
DateControlField:
  type: dateControl
  defaultDateRange?: DateRange   # falls back to Dashboard.defaultDateRange
  styling?: Styling
```

The date control applies to every widget through the widget's `dateRangeFieldId`.

## Control state

Control state is runtime input from the viewer. It is the only variable part of a query and the second component of the cache key.

```yaml
ControlState:
  dateRange?: DateRange
  values?: Record<string, unknown[]>   # controlWidgetId -> selected values
```

Server validation:

- keys in `values` must be control widget ids of the dashboard; unknown keys are rejected
- values are lenient: any value for the control's field is accepted, since the editor chose to expose that field
- `dateRange` is required if the dashboard has a date control, otherwise `Dashboard.defaultDateRange` is used

## Text field

```yaml
TextField:
  type: text
  content: RichTextDocument
  styling?: Styling

RichTextDocument:
  schemaVersion: string
  document: unknown          # the editor's versioned JSON, never HTML
```
