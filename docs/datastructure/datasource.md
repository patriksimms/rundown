# Datasource

A datasource is one Parquet object in R2, or a prefix of partitioned Parquet files. Editors can
upload one Parquet or CSV file up to 100 MB from the registration UI or select data already in the
workspace. Managed CSV uploads are converted to compressed Parquet before registration.

```yaml
DataSource:
  id: string
  workspaceId: string
  name: string
  source: DataSourceLocation
  version: string # R2 etag, or concatenated etags of the prefix listing
  fields: FieldMetadata[]
  calculatedFields: CalculatedField[]
  createdAt: string
  updatedAt: string

DataSourceLocation:
  kind: object | prefix
  key: string # must start with the workspace r2Prefix
  format: parquet | csv
```

Browser uploads stream through an authorized Worker endpoint into a generated key below the
workspace prefix. CSV registration gives the query container short-lived, object-specific URLs to
read the upload and write one Parquet object. Registration then runs `DESCRIBE`, seeds `fields`
(see defaults below), and stores `version`. `version` is part of every query cache key, so a
replaced file invalidates cached results without any invalidation code.

## Field metadata

One row per column in the file. This is the lookup table users maintain; it is what `describeDatasource` returns to agents.

```yaml
FieldMetadata:
  id: string # fieldId; stable, generated at registration
  columnName: string # raw column in the file
  canonicalName: string # workspace-wide name, defaults to columnName
  label: string # display name, defaults to columnName
  role: FieldRole
  semanticType: SemanticType
  defaultAggregation?: Aggregation # metric fields default to sum
  description?: string # free text, read by agents
  hidden?: boolean # excluded from describeDatasource and field pickers
  castTo?: string # DuckDB type override, e.g. VARCHAR for 64-bit ids
  sampleValues?: unknown[] # refreshed at registration
  cardinality?: integer # refreshed at registration

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

A row-level formula evaluated before aggregation. It appears in the field list like a column and
shares the `fieldId` namespace.

```yaml
CalculatedField:
  id: string # fieldId
  canonicalName: string
  label: string
  expression: string # safe scalar formula over canonical names
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
  expression: if(DSP = 'PI', OutboundClicks, Clicks)

- label: Platform (consolidated)
  canonicalName: platform_group
  role: dimension
  semanticType: text
  expression: if(Platform = 'FB' or Platform = 'FAN', 'FB', Platform)

- label: Creative solution
  canonicalName: creative_solution
  role: dimension
  semanticType: text
  expression: lower(Campaign)
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
  expression: string # safe aggregate formula over canonical names
  semanticType: SemanticType
  description?: string
  updatedAt: string
```

Examples seeded for the esome workspace:

```yaml
- name: CTR
  expression: sum(link_clicks + outbound_clicks) / sum(impressions)
  semanticType: ratio

- name: CPM
  expression: sum(media_cost) / sum(impressions) * 1000
  semanticType: currency

- name: VTR
  expression: sum(video_complete) / sum(impressions)
  semanticType: ratio

- name: CPV
  expression: sum(media_cost) / sum(video_starts)
  semanticType: currency
```

Seeds are data. Nothing domain-specific is hardcoded.

## Validation of expressions

The server validates every calculated field and metric formula before storing it:

1. The custom parser accepts only literals, canonical field references, operators, and allowlisted
   functions.
2. Every reference must resolve against saved field metadata.
3. Calculated fields must be row-level. Library and custom metrics must be aggregate formulas.
4. The compiler emits quoted DuckDB SQL from the parsed formula tree.

Validation never starts DuckDB or reads the datasource. Failures return a formula validation error
to the editor or agent.
