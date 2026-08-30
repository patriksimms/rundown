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
  alignment: 'key' | 'index' = 'index',
  metricNames?: string[],
) {
  const [dimension, ...rowMetrics] = Object.keys(rows[0] ?? comparisonRows[0] ?? {});
  const metrics =
    metricNames ?? (rowMetrics.length ? rowMetrics : Object.keys(comparisonRows[0] ?? {}).slice(1));
  if (!dimension) return rows;
  const comparisonsByDimension = new Map(
    comparisonRows.map((row) => [String(row[dimension]), row]),
  );
  const currentDimensions = new Set(rows.map((row) => String(row[dimension])));
  const alignedRows =
    alignment === 'key'
      ? [
          ...rows,
          ...comparisonRows
            .filter((row) => !currentDimensions.has(String(row[dimension])))
            .map((row) => ({
              [dimension]: row[dimension],
              ...Object.fromEntries(metrics.map((metric) => [metric, undefined])),
            })),
        ]
      : rows;
  return alignedRows.map((row, index) => ({
    ...row,
    ...Object.fromEntries(
      metrics.map((metric, metricIndex) => [
        `comparison_${metricIndex}`,
        (alignment === 'key'
          ? comparisonsByDimension.get(String(row[dimension]))
          : comparisonRows[index])?.[metric],
      ]),
    ),
  }));
}

export function alignDateComparisonRows(
  rows: Record<string, unknown>[],
  mode: 'previousPeriod' | 'previousYear',
  currentRange: { start: string; end: string },
) {
  const dimension = Object.keys(rows[0] ?? {})[0];
  if (!dimension) return rows;
  const periodDays =
    Math.round(
      (Date.parse(`${currentRange.end}T00:00:00Z`) -
        Date.parse(`${currentRange.start}T00:00:00Z`)) /
        86_400_000,
    ) + 1;
  return rows.map((row) => {
    const value = row[dimension];
    const sourceDate =
      value instanceof Date
        ? value
        : typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)
          ? new Date(`${value.slice(0, 10)}T00:00:00Z`)
          : undefined;
    if (!sourceDate) return row;
    const date = new Date(sourceDate);
    if (mode === 'previousPeriod') date.setUTCDate(date.getUTCDate() + periodDays);
    else {
      const month = date.getUTCMonth();
      date.setUTCFullYear(date.getUTCFullYear() + 1, month, 1);
      const lastDay = new Date(Date.UTC(date.getUTCFullYear(), month + 1, 0)).getUTCDate();
      date.setUTCDate(Math.min(sourceDate.getUTCDate(), lastDay));
    }
    return {
      ...row,
      [dimension]:
        value instanceof Date
          ? date
          : `${date.toISOString().slice(0, 10)}${typeof value === 'string' ? value.slice(10) : ''}`,
    };
  });
}

export function seriesMetricIndex(series: string, currentMetrics: string[]) {
  return series.startsWith('comparison_')
    ? Number(series.slice('comparison_'.length))
    : currentMetrics.indexOf(series);
}

export function tableSummaryDefinition(definition: WidgetDefinition): WidgetDefinition | undefined {
  if (definition.type !== 'table' || !definition.showSummaryRow || !definition.dimensions.length)
    return undefined;
  return {
    ...definition,
    dimensions: [],
    resultLimit: { mode: 'top', amount: 1 },
    sort: undefined,
    showSummaryRow: false,
  };
}
