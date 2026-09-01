import { z } from 'zod';

export const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (timezone) => {
      if (/^[+-]/.test(timezone)) return false;
      try {
        new Intl.DateTimeFormat('en', { timeZone: timezone });
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Use a valid IANA timezone name.' },
  );

export const fieldRoleSchema = z.enum(['dimension', 'metric']);
export const semanticTypeSchema = z.enum(['currency', 'count', 'ratio', 'text', 'date', 'id']);
export const aggregationSchema = z.enum([
  'sum',
  'average',
  'count',
  'countDistinct',
  'min',
  'max',
  'median',
  'standardDeviation',
  'variance',
]);

const relativeDateSchema = z.object({
  amount: z.number().int().nonnegative(),
  unit: z.enum(['day', 'week', 'month', 'quarter', 'year']),
  direction: z.enum(['past', 'future']),
  anchor: z.enum(['now', 'startOfDay', 'startOfWeek', 'startOfMonth']),
});

const dateValueSchema = z.union([
  z.object({ fixed: z.iso.date() }),
  z.object({ relative: relativeDateSchema }),
]);

export const dateRangeSchema = z
  .object({ startDate: dateValueSchema, endDate: dateValueSchema })
  .refine(
    (value) =>
      !('fixed' in value.startDate) ||
      !('fixed' in value.endDate) ||
      value.startDate.fixed <= value.endDate.fixed,
    {
      message: 'The start date must not be after the end date.',
    },
  );

const stylingSchema = z.record(z.string(), z.unknown()).optional();

export const filterConditionSchema = z.object({
  fieldId: z.string().min(1),
  operator: z.enum([
    'equals',
    'notEquals',
    'contains',
    'notContains',
    'in',
    'notIn',
    'greaterThan',
    'greaterThanOrEqual',
    'lessThan',
    'lessThanOrEqual',
    'isEmpty',
    'isNotEmpty',
  ]),
  value: z.unknown().optional(),
});

export const filterSchema = z.object({
  conditions: z.array(filterConditionSchema),
  connector: z.enum(['and', 'or']).default('and'),
});

const metricSchema = z.object({
  source: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('field'),
      fieldId: z.string().min(1),
      aggregation: aggregationSchema,
    }),
    z.object({ kind: z.literal('library'), libraryMetricId: z.string().min(1) }),
    z.object({ kind: z.literal('expression'), expression: z.string().min(1) }),
  ]),
  userDefinedName: z.string().trim().min(1).optional(),
  dataType: z.enum(['number', 'percent', 'duration', 'currency']),
  displayFormat: z.object({ radix: z.number().int().min(0).max(10).optional() }).optional(),
  styling: stylingSchema,
});

const dimensionSchema = z.object({
  fieldId: z.string().min(1),
  userDefinedName: z.string().trim().min(1).optional(),
  styling: stylingSchema,
});

const comparisonSchema = z.object({ mode: z.enum(['none', 'previousPeriod', 'previousYear']) });
const sortSchema = z.object({
  target: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('dimension'), fieldId: z.string().min(1) }),
    z.object({ kind: z.literal('metric'), index: z.number().int().nonnegative() }),
  ]),
  direction: z.enum(['asc', 'desc']),
});

const cardBase = {
  title: z.string().trim().min(1),
  dataSourceId: z.string().min(1),
  dateRangeFieldId: z.string().min(1),
  filter: filterSchema.optional(),
  styling: stylingSchema,
};

export const widgetDefinitionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('control'),
    dataSourceId: z.string().min(1),
    fieldId: z.string().min(1),
    userDefinedName: z.string().trim().min(1).optional(),
    defaultValues: z.array(z.unknown()).optional(),
    allowMultiple: z.boolean().default(true),
    filter: filterSchema.optional(),
    optionsSortDirection: z.enum(['asc', 'desc']).optional(),
    styling: stylingSchema,
  }),
  z.object({
    type: z.literal('dateControl'),
    defaultDateRange: dateRangeSchema.optional(),
    styling: stylingSchema,
  }),
  z.object({
    type: z.literal('text'),
    content: z.object({ schemaVersion: z.string().min(1), document: z.unknown() }),
    styling: stylingSchema,
  }),
  z.object({
    ...cardBase,
    type: z.literal('scorecard'),
    metric: metricSchema,
    comparison: comparisonSchema.optional(),
  }),
  z.object({
    ...cardBase,
    type: z.literal('gauge'),
    metric: metricSchema,
    comparison: comparisonSchema.optional(),
    upperLimit: z
      .discriminatedUnion('kind', [
        z.object({ kind: z.literal('manual'), value: z.number() }),
        z.object({ kind: z.literal('library'), libraryMetricId: z.string().min(1) }),
      ])
      .optional(),
  }),
  z.object({
    ...cardBase,
    type: z.literal('line'),
    dimension: dimensionSchema,
    metrics: z.array(metricSchema).min(1),
    comparison: comparisonSchema.optional(),
  }),
  z.object({
    ...cardBase,
    type: z.literal('bar'),
    metric: metricSchema,
    dimension: dimensionSchema,
    breakdownDimension: dimensionSchema.optional(),
    comparison: comparisonSchema.optional(),
    sort: z.array(sortSchema).optional(),
    limit: z.number().int().positive().max(500).optional(),
  }),
  z.object({
    ...cardBase,
    type: z.literal('pie'),
    metric: metricSchema,
    dimension: dimensionSchema,
    breakdownDimension: dimensionSchema.optional(),
    sort: z.array(sortSchema).optional(),
    limit: z.number().int().positive().max(500).optional(),
  }),
  z.object({
    ...cardBase,
    type: z.literal('table'),
    dimensions: z.array(dimensionSchema),
    metrics: z.array(metricSchema).min(1),
    comparison: comparisonSchema.optional(),
    resultLimit: z.object({
      mode: z.enum(['pagination', 'top']),
      amount: z.number().int().positive().max(500),
    }),
    showSummaryRow: z.boolean().optional(),
    sort: z.array(sortSchema).optional(),
  }),
]);

export const gridPlacementSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const dashboardWidgetSchema = z.object({
  id: z.string().min(1),
  layout: gridPlacementSchema,
  definition: widgetDefinitionSchema,
  definitionHash: z.string().min(1),
});

export const dashboardDocumentSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  name: z.string().trim().min(1),
  schemaVersion: z.literal(2),
  // Persisted documents predate strict timezone validation. Requests validate new values.
  timezone: z.string().min(1).default('Europe/Berlin'),
  defaultDateRange: dateRangeSchema,
  columns: z.number().int().positive().default(12),
  widgets: z.array(dashboardWidgetSchema),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const controlStateSchema = z.object({
  dateRange: dateRangeSchema.optional(),
  values: z.record(z.string(), z.array(z.unknown())).optional(),
});

export const dataSourceLocationSchema = z.object({
  kind: z.enum(['object', 'prefix']),
  key: z.string().trim().min(1),
  format: z.enum(['parquet', 'csv']),
});

export type DashboardDocument = z.infer<typeof dashboardDocumentSchema>;
export type DashboardWidget = z.infer<typeof dashboardWidgetSchema>;
export type WidgetDefinition = z.infer<typeof widgetDefinitionSchema>;
export type ControlState = z.infer<typeof controlStateSchema>;
export type DateRange = z.infer<typeof dateRangeSchema>;
export type FieldRole = z.infer<typeof fieldRoleSchema>;
export type SemanticType = z.infer<typeof semanticTypeSchema>;
export type Aggregation = z.infer<typeof aggregationSchema>;
export type DataSourceLocation = z.infer<typeof dataSourceLocationSchema>;

export const defaultDateRange: DateRange = {
  startDate: { relative: { amount: 30, unit: 'day', direction: 'past', anchor: 'startOfDay' } },
  endDate: { relative: { amount: 0, unit: 'day', direction: 'past', anchor: 'startOfDay' } },
};
