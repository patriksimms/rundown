# Datasource

A datasource is one parquet or CSV object in R2, or a prefix of partitioned files. Files are already in R2; the app never ingests or transforms data.

```yaml
DataSource:
  id: string
  workspaceId: string
  name: string
  source: DataSourceLocation
  version: string            # R2 etag, or concatenated etags of the prefix listing
  fields: FieldMetadata[]
  calculatedFields: CalculatedField[]
  createdAt: string
  updatedAt: string

DataSourceLocation:
  kind: object | prefix
  key: string                # must start with the workspace r2Prefix
  format: parquet | csv
```

Registration runs `DESCRIBE` on the file, seeds `fields` (see defaults below), and stores `version`. `version` is part of every query cache key, so a replaced file invalidates cached results without any invalidation code.

## Field metadata

One row per column in the file. This is the lookup table users maintain; it is what `describeDatasource` returns to agents.

```yaml
FieldMetadata:
  id: string                 # fieldId; stable, generated at registration
  columnName: string         # raw column in the file
  canonicalName: string      # workspace-wide name, defaults to columnName
  label: string              # display name, defaults to columnName
  role: FieldRole
  semanticType: SemanticType
  defaultAggregation?: Aggregation # metric fields default to sum
  description?: string       # free text, read by agents
  hidden?: boolean           # excluded from describeDatasource and field pickers
  castTo?: string            # DuckDB type override, e.g. VARCHAR for 64-bit ids
  sampleValues?: unknown[]   # refreshed at registration
  cardinality?: integer      # refreshed at registration

FieldRole: dimension | metric | date | id

SemanticType: currency | count | ratio | text | date | id
```

Seeding defaults at registration:

- numeric columns become `metric` / `count`
- text columns become `dimension` / `text`
- date and timestamp columns become `date` / `date`
- columns whose name ends in `Id` become `id` / `id` with `castTo: VARCHAR`

Admins correct only what matters afterwards.

## Calculated field

A row-level DuckDB expression evaluated before aggregation. It appears in the field list like a column and shares the `fieldId` namespace.

```yaml
CalculatedField:
  id: string                 # fieldId
  canonicalName: string
  label: string
  expression: string         # DuckDB scalar expression over columnNames of this datasource
  role: FieldRole
  semanticType: SemanticType
  defaultAggregation?: Aggregation
  description?: string
  updatedAt: string
```

Examples:

```yaml
- label: Effective clicks
  canonicalName: effective_clicks
  role: metric
  semanticType: count
  expression: CASE WHEN "DSP" = 'PI' THEN "OutboundClicks" ELSE "Clicks" END

- label: Platform (consolidated)
  canonicalName: platform_group
  role: dimension
  semanticType: text
  expression: CASE WHEN "Platform" IN ('FB', 'FAN') THEN 'FB' ELSE "Platform" END

- label: Creative solution
  canonicalName: creative_solution
  role: dimension
  semanticType: text
  expression: regexp_extract("Creative / Ad Name", '^(.*)_.*_.*_.*', 1)
```

Editing a calculated field changes the cache hash of every widget that references it.

## Library metric

Workspace-level aggregate expressions written against canonical names. A library metric applies to a datasource when every canonical name it references exists there (as a column or a calculated field). The compiler rewrites canonical names to the datasource's columns.

```yaml
LibraryMetric:
  id: string
  workspaceId: string
  name: string
  canonicalName: string
  expression: string         # DuckDB aggregate expression over canonical names
  semanticType: SemanticType
  description?: string
  updatedAt: string
```

Examples seeded for the esome workspace:

```yaml
- name: CTR
  expression: SUM(link_clicks + outbound_clicks) / SUM(impressions)
  semanticType: ratio

- name: CPM
  expression: SUM(media_cost) / SUM(impressions) * 1000
  semanticType: currency

- name: VTR
  expression: SUM(video_complete) / SUM(impressions)
  semanticType: ratio

- name: CPV
  expression: SUM(media_cost) / SUM(video_starts)
  semanticType: currency
```

Seeds are data. Nothing domain-specific is hardcoded.

## Validation of expressions

The server validates every calculated field and metric expression before storing it:

1. One expression, no statement separators.
2. The compiled query passes `EXPLAIN` against the datasource.
3. The authorized datasource is materialized into a temporary table, then external access is
   disabled before the expression is compiled or run.

Failures return the DuckDB error text to the editor or agent.
