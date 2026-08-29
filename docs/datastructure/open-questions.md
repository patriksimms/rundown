# Open questions

Items from the whiteboard that discovery settled are recorded inline in the other documents and in [../plan.md](../plan.md). What remains:

## Query behavior

- Nested filter groups. Deferred; one connector per filter for now. Revisit when a real dashboard needs `(a OR b) AND c`.
- Compatible types for control matching by canonical name. Proposal: same `semanticType`, or both `text`. Confirm once the first cross-datasource dashboard exists.
- `countDistinct` on large datasets may time out in DuckDB wasm. Decide whether to expose `approxCountDistinct` as an aggregation.

## Datasource

- Refreshing `sampleValues` and `cardinality` after registration. Manual "refresh metadata" action or on every version change?
- Prefix datasources: how partition columns (hive style `date=2026-02-16/`) are surfaced in the lookup table.

## Rendering

- Line chart axis override per metric. Deferred; derived from `dataType` until someone needs it.
- Shared `styling` keys across renderers. Each renderer owns its keys until a pattern emerges.
- Rich text editor choice and its JSON schema version.

## Verification pending

- ducklings `EXPLAIN` output prints file paths (needed for expression isolation, see [datasource.md](./datasource.md)).
- Clerk Organizations are available on the current Clerk plan.
