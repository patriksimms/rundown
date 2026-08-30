import type { WidgetDefinition } from './schema';

interface QueryMetadata {
  fields: Array<{
    id: string;
    columnName: string;
    canonicalName: string;
    label: string;
    castTo: string | null;
  }>;
  calculatedFields: Array<{
    id: string;
    canonicalName: string;
    label: string;
    expression: string;
  }>;
  libraryMetrics: Array<{
    id: string;
    canonicalName: string;
    name: string;
    expression: string;
  }>;
}

export function widgetDependencyState(definition: WidgetDefinition, metadata: QueryMetadata) {
  const libraryMetricIds = new Set([
    ...metricsIn(definition).flatMap((metric) =>
      metric.source.kind === 'library' ? [metric.source.libraryMetricId] : [],
    ),
    ...(definition.type === 'gauge' && definition.upperLimit?.kind === 'library'
      ? [definition.upperLimit.libraryMetricId]
      : []),
  ]);
  return {
    definition,
    fields: metadata.fields
      .map(({ id, columnName, canonicalName, label, castTo }) => ({
        id,
        columnName,
        canonicalName,
        label,
        castTo,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    calculatedFields: metadata.calculatedFields
      .map(({ id, canonicalName, label, expression }) => ({
        id,
        canonicalName,
        label,
        expression,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    libraryMetrics: metadata.libraryMetrics
      .filter((metric) => libraryMetricIds.has(metric.id))
      .map(({ id, canonicalName, name, expression }) => ({ id, canonicalName, name, expression }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function queryCacheState(input: {
  definitionHash: string;
  requestedDateRange: unknown;
  resolvedDateRange: { start: string; end: string };
  resolvedControls: unknown;
  dataSourceVersion: string;
  timezone: string;
}) {
  return {
    version: 2,
    definitionHash: input.definitionHash,
    controlState: {
      dateRange: {
        requested: input.requestedDateRange,
        resolved: input.resolvedDateRange,
      },
      values: input.resolvedControls,
    },
    dataSourceVersion: input.dataSourceVersion,
    timezone: input.timezone,
  };
}

function metricsIn(definition: WidgetDefinition) {
  return 'metric' in definition
    ? [definition.metric]
    : 'metrics' in definition
      ? definition.metrics
      : [];
}
