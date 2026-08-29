import type { WidgetDefinition } from './schema';

interface QueryMetadata {
  calculatedFields: Array<{ id: string; expression: string }>;
  libraryMetrics: Array<{ id: string; expression: string }>;
}

export function widgetDependencyState(definition: WidgetDefinition, metadata: QueryMetadata) {
  const libraryMetricIds = new Set(
    metricsIn(definition).flatMap((metric) =>
      metric.source.kind === 'library' ? [metric.source.libraryMetricId] : [],
    ),
  );
  return {
    definition,
    calculatedFields: [...metadata.calculatedFields].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    libraryMetrics: metadata.libraryMetrics
      .filter((metric) => libraryMetricIds.has(metric.id))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function metricsIn(definition: WidgetDefinition) {
  return 'metric' in definition
    ? [definition.metric]
    : 'metrics' in definition
      ? definition.metrics
      : [];
}
