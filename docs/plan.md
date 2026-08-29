# Rundown: discovery brief and plan

Status: discovery outcome agreed on 2026-08-29 and implemented in the feature branch linked from
issue #1. Deployment credentials, remote migrations, and the live release remain external rollout
steps.

## 1. Problem and users

esome account managers build and change client dashboards on a weekly basis. Two tools are in use today and both fall short.

Looker Studio has the right capabilities (BigQuery underneath, SQL, CASE WHEN calculated fields) but is unreliable, hard to adjust, and has no support. Whatagraph is reliable and has the nicer UI, but there are no blends, no SQL, custom formulas are limited, and it is expensive.

Neither tool can turn intent into widgets. An account manager knows that "a Targeting report on adset level" matters for a client. The tool cannot infer what that looks like, so every new client means translating intent into elements by hand.

Users:

- Editors (account managers). Create dashboards, write formulas, invite others. Want to describe intent to an agent and then fine-tune in a GUI, because when they already know the fix (a CASE WHEN mapping campaign IDs to readable names) explaining it to an AI is slower than doing it.
- Viewers (clients, agency contacts). Experts in their domain, want a GUI, should never have to type. Reach dashboards via unlisted links or a viewer login.
- Admins. Everything, plus datasource registration and workspace management.

## 2. Challenge context

The project is built for the OpenAI WebMCP Challenge. Time limit is not a constraint for scope decisions (agreed), but the challenge still defines how the WebMCP side gets judged.

From the official rules ([Devpost](https://webmcp.devpost.com/rules)):

- Four equally weighted criteria: WebMCP leverage, execution (complete product, not a proof of concept), potential impact, creativity.
- Judges test in the ChatGPT desktop app's built-in browser or in Chrome with WebMCP enabled. They may use credentials the entrant provides.
- Deliverables: live URL, public repository with an open source license, video under 3 minutes, text description.

From ChatGPT's WebMCP docs ([learn.chatgpt.com/docs/webmcp](https://learn.chatgpt.com/docs/webmcp)):

- ChatGPT calls `document.modelContext.registerTool()`. Supported fields: `name`, `description`, `inputSchema`, `annotations.readOnlyHint`, `execute`.
- Not supported: `outputSchema`, declarative form attributes, tools inside iframes (same-origin or not).
- ChatGPT reviews each invocation and asks the user to confirm consequential actions (deletions, permission changes). Tool output is treated as untrusted.
- Works in the ChatGPT desktop app browser, ChatGPT Work, Codex. Not in Enterprise or Education workspaces. Test with a personal account if the esome workspace is Enterprise.
- Guidance from the docs: keep inputs focused, document side effects, return verification data, reuse the app's own auth, keep the normal UI working in browsers without WebMCP.

From the spec ([webmachinelearning.github.io/webmcp](https://webmachinelearning.github.io/webmcp/)): tools are registered per document, unregistered through an `AbortSignal`, and a `toolchange` event fires on add or remove. `provideContext` and `clearContext` no longer exist.

## 3. Decisions

1. Stack: TanStack Start + React, shadcn/ui including shadcn charts, Tailwind. Playwright for e2e. Bun for tooling.
2. Hosting: Cloudflare Workers, paid plan (already upgraded). One build produces an app Worker and a
   private query Worker connected through a Service Binding.
3. Query engine: Ducklings and DuckDB/WASM in the private query Worker, reading parquet and CSV from
   R2 over httpfs. Splitting the query engine gives each Worker its own compressed-size allowance. No
   DuckDB runs in the browser.
4. Application data: Cloudflare D1 with Drizzle.
5. Auth: Clerk. Workspaces map to Clerk Organizations.
6. Security model: viewers can only trigger queries the dashboard already defines. Column secrecy is explicitly not a goal, because a derived metric next to its denominator makes the numerator derivable anyway (CPM and impressions give spend).
7. Clients never send SQL or column names. The one query endpoint is `queryWidget(widgetId, controlState)`, used by both the UI and the WebMCP tool.
8. Formulas are DuckDB SQL expressions at two levels: row-level calculated fields on the datasource, aggregate metric expressions on widgets and in a workspace-level metric library. No custom formula language.
9. Field semantics come from a lookup table per datasource that users maintain. A real catalog is deferred.
10. Metric library is workspace-level data, configurable in the UI and via a tool. Nothing domain-specific is hardcoded.
11. Caching is lazy. Key = hash(widget definition and referenced calculated fields) + normalized control state + datasource version. No cron.
12. Multi-tenant from the start. Every row carries a `workspaceId`; R2 keys live under a per-workspace prefix.
13. Files are already in R2. No upload UI. Ingestion and transformation are out of scope.
14. Controls across datasources behave like Looker Studio: a control applies to every widget whose datasource has a matching field, matched on canonical name from the lookup table.
15. Every builder action and every consumption question is a WebMCP tool, and the GUI exposes the same actions. Login is not a tool.
16. No AI agent inside the app. Intent inference is done by the external agent (ChatGPT, Chrome) using what `describeDatasource` returns.
17. The whole app is usable on mobile. Desktop is the main target, but every screen (viewer, editor, datasource admin, sharing) works on a phone. CSS is written mobile-first in the Tailwind way: base styles target the smallest screen, `sm:`/`md:`/`lg:` add layout for larger ones. No screen is desktop-only.

## 4. Architecture

Components, built together and deployed as two Workers:

- TanStack Start app. SSR routes, client-side dashboard editor and viewer, WebMCP tool registration in the client.
- Server functions / API routes. Auth via Clerk, authorization against D1, query compilation, cache lookup, DuckDB execution.
- D1. Workspaces, memberships, datasources, field metadata, calculated fields, library metrics, dashboards, dashboard grants, share links, query cache index.
- R2. One bucket. Data files under `ws/<workspaceId>/...`. Optionally cached query results as objects if KV turns out too small.
- KV. Query result cache keyed by hash. Global, eventually consistent, fine for dashboard results.
- Private DuckDB query Worker. It creates an in-memory database per request and reads R2 with secrets
  held only by that Worker. It has no route and is reachable through a Service Binding.

Request flow for a viewer opening a dashboard:

1. Route loader resolves the dashboard by id or share token, checks the grant, returns the dashboard document and default control state.
2. Client renders widgets and calls `queryWidget` for each, with the current control state.
3. Server validates control state against the dashboard's controls, computes the cache key, and
   returns a cached result or sends the authorized source and compiled query to the private query
   Worker through the Service Binding.
4. Client registers view-mode WebMCP tools once the dashboard has loaded.

Request flow for an editor adding a widget through ChatGPT:

1. ChatGPT calls `addWidget` with a widget definition.
2. The tool's `execute` calls the same server function the GUI uses. Server validates the definition (schema, field references, expression compiles), appends the widget, stores the dashboard.
3. Server returns the stored widget including its id and the compiled SQL. The UI updates through the same client state the GUI uses, so the user watches the widget appear.

## 5. Tenancy, roles, sharing

Workspace = Clerk Organization. A Clerk org admin is the app admin. Any org member may create dashboards (editor). Confirm on Clerk's pricing page that organizations are included on the current plan; not verified during discovery.

Per dashboard, D1 holds grants: `editor` or `viewer` for a Clerk user id. The creator is an editor. Editors can add editors and viewers. Admins see everything in the workspace.

Unlisted links. A share link is a random, non-guessable token stored in D1 that resolves to exactly one dashboard. Anyone with the link reads the dashboard and calls `queryWidget` for its widgets, nothing else. Editors create and revoke links. Links are workspace-independent from the viewer's perspective; the server derives the workspace from the dashboard.

R2 isolation. Datasource registration lists objects under `ws/<workspaceId>/` via the R2 binding and refuses any key outside it. The Worker's R2 credential sees the whole bucket, so formula validation (section 7) must prevent cross-prefix reads. If that turns out too weak, the fallback is one bucket per workspace with a bucket-scoped token per workspace. Not needed initially.

Judging access. Provide a test account with editor rights and at least one unlisted dashboard in the submission.

## 6. Datasources and field metadata

A datasource points at one R2 object or a prefix glob (partitioned files, `read_parquet('r2://bucket/ws/x/reports/*.parquet')`). CSV and parquet both read directly, no conversion.

Registration: admin picks an object or prefix from the listing, the Worker runs `DESCRIBE` on it, and the lookup table is seeded automatically. Numeric columns become metrics, text becomes dimensions, date-like columns become dates. The admin then corrects only what matters. With 200 columns nobody annotates by hand.

Lookup table, one row per column:

- `columnName`: raw column in the file.
- `canonicalName`: stable name used for cross-datasource control matching and by the metric library (e.g. `campaign`, `impressions`, `media_cost`). Defaults to the column name.
- `label`: display name.
- `role`: `dimension | metric | date | id`.
- `semanticType`: `currency | count | ratio | text | date | id`.
- `description`: free text, this is what the agent reads.
- `hidden`: exclude from `describeDatasource` and from the field picker.
- `castTo`: optional override for the inferred type, needed for 64-bit ids that must stay `VARCHAR`.

Calculated fields belong to the datasource. Row-level, evaluated before aggregation. Examples from the esome guide that belong here: `CASE WHEN "DSP" = 'PI' THEN "OutboundClicks" ELSE "Clicks" END` as `effective_clicks`, `CASE WHEN "Platform" IN ('FB','FAN') THEN 'FB' ELSE "Platform" END`, `regexp_extract("Creative / Ad Name", '^(.*)_.*_.*_.*', 1)`. They appear in the field list with a role and semantic type like any column.

Datasource version is the R2 object etag (or the concatenated etags of the prefix listing). It is part of every cache key.

Known problems in `reporting_example.csv`: `Date` is a JavaScript `toString()` dump and will not parse, use `DateStart`. `AccountId`, `CampaignId`, `AdSetId`, `AdId` exceed 2^53 and must be `VARCHAR`.

## 7. Formulas and validation

Two levels, mirroring Looker Studio and the esome calculated fields guide:

- Row-level calculated fields on the datasource (section 6). Any scalar expression over columns.
- Aggregate metric expressions on widgets. Examples: `SUM("MediaCost") / SUM("Impressions") * 1000` (CPM), `SUM("VideoComplete") / SUM("Impressions")` (VTR), `SUM("VideoComplete" * IF(contains("Campaign", 'Kampagne2023'), 0.108, 0.117)) / SUM("Impressions") * 1000`.

Metric library. Workspace-level list of named aggregate expressions written against canonical names (`SUM(media_cost) / SUM(impressions) * 1000`). A library metric applies to a datasource when every canonical name it references exists there. The compiler rewrites canonical names to the datasource's columns. Seed the esome workspace with CTR, CPM, VTR, CPV, effective clicks, platform consolidation, from the guide. Seeding is data, editable in the UI and via `upsertLibraryMetric`.

Language: DuckDB SQL expressions, verbatim. Only editors and admins write them. Viewers never submit expressions.

Validation, in this order:

1. Structural. The expression is embedded in a server-side template as one statement. Semicolons and multiple statements are rejected.
2. Compile. The compiled query runs with `EXPLAIN` against the datasource. Syntax and unknown columns fail here and the error text goes back to the editor or agent.
3. Isolation. The app Worker generates the only external scan from a datasource already authorized
   to the workspace. The query Worker materializes it into `rundown_source`, then runs
   `SET enable_external_access = false` before compiling or executing user expressions. A regression
   test proves a user expression cannot read a local file.

Later option, not now: a small expression grammar with a function allowlist, which would also power a no-SQL formula editor.

## 8. Query pipeline

`queryWidget(widgetId, controlState)`:

1. Resolve widget and dashboard; check the caller's grant or share token.
2. Validate `controlState`. Allowed keys are the dashboard's date control and the fields exposed as controls. Values are lenient: any value for the control's field is accepted, because options paginate and the editor already chose to expose that field. Unknown keys are rejected.
3. Resolve control state per widget. A control on canonical name `campaign` applies to this widget if its datasource has a field with that canonical name and compatible type; otherwise it is ignored for this widget, not rejected. Date controls apply through the widget's `dateRangeFieldId`.
4. Cache key = sha256(widget definition JSON + referenced calculated field definitions + referenced library metric definitions) + sha256(normalized resolved control state) + datasource version. Look up in KV.
5. On miss, compile SQL from the definition: `SELECT dims, metric expressions FROM read_parquet(...) WHERE date range AND filters GROUP BY dims ORDER BY ... LIMIT ...`. Comparison runs as a second query with the shifted range. Run in DuckDB, store the result in KV, return.

Editing a widget changes its hash, so old cache entries become unreachable and expire by TTL. No invalidation code. Editing a calculated field changes the hash of every widget referencing it for the same reason.

`previewWidget` runs the same pipeline on an unsaved definition, without touching the cache.

`explainWidget` returns the compiled SQL plus the metric and calculated field definitions and descriptions, so a viewer or agent can see what a number means.

Query-Worker constraints to respect: datasource materialization is in-memory, Workers have 128 MB of
memory, and 64-bit integers are serialized losslessly. Ducklings uses Asyncify for remote reads, so
requests are serialized within an isolate while Cloudflare remains free to create more isolates.

## 9. Dashboards, widgets, controls

Dashboard document (stored as JSON in D1 with `schemaVersion`) holds name, timezone, default date range, widgets with grid placement, and the control definitions.

Widget types kept: scorecard, gauge, line, bar, pie, table, control, date control, text. All cards get a `title`.

Layout: fixed column grid, no overlap, compact flow. `addWidget` accepts only `width` and `height` and appends at the bottom. `moveWidget` sets x/y. Agents do not compute coordinates.

Controls publish values into dashboard control state. A filter control on a field applies across datasources by canonical name (decision 14). The date control applies to every widget.

Responsive behavior. The stored grid describes the large-screen layout. On small screens widgets stack in a single column in grid order (row by row, left to right) and controls move into a sticky bar or sheet at the top; tables scroll horizontally inside their card. Nothing mobile-specific is stored. The editor follows the same rule: drag and resize are pointer features that appear at `md:` and up, while every edit action (title, metrics, filters, formulas, layout size) is also reachable through forms and menus that work with touch. Datasource admin, the lookup table, and sharing are plain forms and lists and get the same mobile-first treatment.

## 10. Changes to `docs/datastructure`

To be rewritten in a separate step. The deltas agreed in discovery:

- Add a `DataSource` document: R2 key or prefix, version, lookup table rows (section 6), calculated fields.
- Add `Workspace`, `DashboardGrant`, `ShareLink`, `LibraryMetric`.
- `Metric` becomes a union: `{ fieldId, aggregation }` | `{ libraryMetricId }` | `{ expression }`. Drop the ambiguous `formula` + `metricFieldId` pairing. `userDefinedName`, `dataType`, `displayFormat`, `styling` stay.
- `Comparison.valueMode` is replaced by `mode: none | previousPeriod | previousYear`. The percent-of-total family is a table calculation, a different feature, deferred.
- `Filter.conditions` stays flat with one `and | or` connector. Nested groups deferred.
- Drop `DataSourceFieldRef` cross-source form; blends are out of scope.
- Add `title` to `CardBase`, `timezone` and `defaultDateRange` to `Dashboard`.
- Keep `GridPlacement` in storage; do not expose x/y on `addWidget`.
- Resolve the open questions with the defaults in section 12.

## 11. WebMCP tool surface

All tools are registered with `document.modelContext.registerTool` and unregistered through an `AbortSignal` tied to the route or mode. Descriptions carry the context the agent needs (which dashboard is open, what mode). Each tool calls the same server function the GUI calls. Tools return the resulting state so the agent can verify and chain.

Feature detection: `if ("modelContext" in document)`. The GUI must work without it.

View mode. Registered when a dashboard is open, for signed-in users and for unlisted viewers. All `readOnlyHint: true`.

- `listDashboards()` returns id, name, datasources per dashboard the caller can see.
- `getDashboard()` returns the open dashboard: widgets with definitions and titles, controls, current control state, timezone.
- `describeDatasource(datasourceId)` returns fields from the lookup table (canonical name, label, role, semantic type, description, sample values, cardinality), calculated fields with their expressions and descriptions, applicable library metrics with expressions and descriptions. This is the tool that makes "build a targeting report" possible without naming columns.
- `queryWidget(widgetId, controlState?)` returns rows and the applied control state. The consumption tool: "why did CTR drop for the AT Easter campaign last week" resolves to one or more of these calls.
- `explainWidget(widgetId)` returns the compiled SQL and plain-language definitions of every metric and calculated field involved.
- `getControlOptions(controlId, search?)` returns selectable values for a control.

Edit mode. Registered in addition to view mode when the caller has an editor or admin grant and the editor UI is open.

- `createDashboard({ name, datasourceIds, timezone?, defaultDateRange? })`.
- `updateDashboard({ name?, timezone?, defaultDateRange? })`.
- `addWidget({ definition, width, height })` appends and returns the stored widget with id and compiled SQL.
- `updateWidget({ widgetId, definition })` takes a full definition (read with `getDashboard` first). No deep patches, because patches on arrays such as `metrics` are ambiguous.
- `removeWidget({ widgetId })`. ChatGPT will ask the user to confirm; that is expected.
- `moveWidget({ widgetId, x, y, width?, height? })`.
- `previewWidget({ definition, controlState? })` runs without saving, returns rows or a compile error. Lets the agent check a formula before committing.
- `copyWidget({ fromDashboardId, widgetId })` copies an existing widget into the open dashboard, remapping the datasource if canonical names match.
- `upsertCalculatedField({ datasourceId, name, expression, role, semanticType, description })`.
- `updateFieldMetadata({ datasourceId, columnName, patch })` edits the lookup table row.
- `upsertLibraryMetric({ name, expression, semanticType, description })`, workspace-level.
- `shareDashboard({ action: createLink | revokeLink | grant | revoke, userEmail?, role? })`.

Admin mode. Registered on the datasource admin route.

- `listR2Objects({ prefix? })` within the workspace prefix.
- `registerDatasource({ key | prefix, name })` runs `DESCRIBE`, seeds the lookup table, returns it.

Input schemas are JSON Schema `type: object` documents generated from the same zod schemas the server validates with, so tool and API cannot drift. Because ChatGPT ignores `outputSchema`, every description states what the tool returns.

## 12. Defaults decided without further discussion

- Comparison runs as a second query with a shifted date range.
- Relative dates resolve in the dashboard's timezone, default `Europe/Berlin`.
- Sort applies after aggregation and before the limit. Secondary sort is allowed on every multi-row widget.
- Gauge upper limit is a manual value or a library metric; manual wins when both are set.
- Widgets cannot overlap.
- Line chart axis assignment derives from `dataType` (numbers left, percents right); no override yet.
- Styling stays an open object owned by each renderer.
- Rich text is stored as the editor's versioned JSON, never as HTML.
- Cache TTL 24 hours; datasource version in the key handles data refreshes.

## 13. Risks and spikes, in order

1. Resolved: moving Ducklings into a second private Worker produces a 10,198.75 KiB compressed query
   Worker and a 437.92 KiB app Worker after `oxc` minification. Both fit their independent 10 MiB
   limits. Temporary-table isolation prevents user expressions from performing external reads.
2. ChatGPT desktop browser discovering tools on a Clerk-authenticated TanStack Start page, including after client-side navigation. Register tools after hydration, re-register on route change.
3. Memory. Workers have a 128 MB isolate limit, and source materialization means memory grows with the
   decoded datasource. Test the representative R2 export in preview before production rollout.
4. Cold start. Measure Ducklings initialization and first-query latency in preview. Cloudflare owns
   isolate creation and eviction, so there is no container sleep window to tune.
5. Tool selection quality with roughly 20 tools. If ChatGPT picks wrong tools, merge (`upsertCalculatedField` and `upsertLibraryMetric` into one) or sharpen descriptions before adding more.

## 14. Deferred

Data catalog beyond the lookup table. Ingestion and transformation. Blends and cross-source fields. Nested filter groups. Percent-of-total comparison modes. Line chart axis override. Per-workspace R2 buckets. Expression grammar with function allowlist. Any AI agent inside the app.

## 15. Sources

- [WebMCP Challenge official rules](https://webmcp.devpost.com/rules)
- [ChatGPT WebMCP docs](https://learn.chatgpt.com/docs/webmcp)
- [WebMCP specification](https://webmachinelearning.github.io/webmcp/)
- [State of WebMCP, July 2026](https://www.spronta.com/blog/state-of-webmcp-july-2026/)
- [ducklings: DuckDB wasm for browsers and Workers](https://github.com/tobilg/ducklings)
- [Cloudflare Workers pricing and limits](https://developers.cloudflare.com/workers/platform/pricing/)
- [R2 SQL limitations](https://developers.cloudflare.com/r2-sql/reference/limitations-best-practices/) (evaluated and not chosen: needs Iceberg tables, not plain files)
- [esome Looker Studio calculated fields guide](https://lookerstudio-guide.esome.info/guides/common-calculated-fields.html)
