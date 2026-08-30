import type { WidgetDefinition } from './schema';

export function pivotBreakdownRows(rows: Record<string, unknown>[]) {
  const [dimension, breakdown, metric] = Object.keys(rows[0] ?? {});
  if (!dimension || !breakdown || !metric) return { rows, series: metric ? [metric] : [] };
  const series = [...new Set(rows.map((row) => String(row[breakdown])))];
  const pivoted = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const key = String(row[dimension]);
    const target = pivoted.get(key) ?? { [dimension]: row[dimension] };
    target[String(row[breakdown])] = row[metric];
    pivoted.set(key, target);
  }
  return { rows: [...pivoted.values()], series };
}

export function pieBreakdownRows(rows: Record<string, unknown>[]) {
  const [dimension, breakdown, metric] = Object.keys(rows[0] ?? {});
  if (!dimension || !breakdown || !metric) return rows;
  return rows.map((row) => ({
    label: `${String(row[dimension])} · ${String(row[breakdown])}`,
    [metric]: row[metric],
  }));
}

export function withComparisonSeries(
  rows: Record<string, unknown>[],
  comparisonRows: Record<string, unknown>[],
) {
  const [dimension, ...metrics] = Object.keys(rows[0] ?? {});
  if (!dimension) return rows;
  return rows.map((row, index) => ({
    ...row,
    ...Object.fromEntries(
      metrics.map((metric) => [`Previous ${metric}`, comparisonRows[index]?.[metric]]),
    ),
  }));
}

export function tableSummary(
  definition: Extract<WidgetDefinition, { type: 'table' }>,
  rows: Record<string, unknown>[],
) {
  const columns = Object.keys(rows[0] ?? {});
  const dimensionCount = definition.dimensions.length;
  return Object.fromEntries(
    columns.map((column, index) => {
      if (index < dimensionCount) return [column, index === 0 ? 'Summary' : ''];
      const values = rows.map((row) => Number(row[column])).filter(Number.isFinite);
      const aggregation = definition.metrics[index - dimensionCount]?.source;
      if (!values.length) return [column, null];
      if (aggregation?.kind === 'field' && aggregation.aggregation === 'average')
        return [column, values.reduce((sum, value) => sum + value, 0) / values.length];
      if (aggregation?.kind === 'field' && aggregation.aggregation === 'min')
        return [column, Math.min(...values)];
      if (aggregation?.kind === 'field' && aggregation.aggregation === 'max')
        return [column, Math.max(...values)];
      return [column, values.reduce((sum, value) => sum + value, 0)];
    }),
  );
}
