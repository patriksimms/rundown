import type { ControlState, DashboardDocument, WidgetDefinition } from '#/domain/schema';
import { resolveDateRange } from '#/domain/dates';
import type {
  CalculatedFieldRecord,
  DataSourceRecord,
  FieldRecord,
  LibraryMetricRecord,
} from './types';
import { rewriteSqlIdentifiers } from './sql-identifiers';

export interface QueryContext {
  dashboard: DashboardDocument;
  definition: WidgetDefinition;
  dataSource: DataSourceRecord;
  fields: FieldRecord[];
  calculatedFields: CalculatedFieldRecord[];
  libraryMetrics: LibraryMetricRecord[];
  controlState: ControlState;
  bucketName: string;
  sourceTableName?: string;
  resolvedControls?: Array<{ fieldId: string; values: unknown[] }>;
}

export interface CompiledQuery {
  sql: string;
  parameters: unknown[];
  definitions: Array<{ name: string; expression: string; description: string | null }>;
}

export function assertSingleExpression(expression: string) {
  if (expression.includes(';') || /--|\/\*/u.test(expression))
    throw new Error('Expressions must contain one SQL expression without comments.');
}

export function compileWidgetQuery(context: QueryContext): CompiledQuery {
  const definition = context.definition;
  if (!('dateRangeFieldId' in definition))
    throw new Error('This widget does not query a datasource.');
  const dimensions = widgetDimensions(definition);
  const metrics = widgetMetrics(definition);
  const definitions: CompiledQuery['definitions'] = [];
  const select = [
    ...dimensions.map(
      (dimension) =>
        `${fieldExpression(dimension.fieldId, context)} AS ${quoteIdentifier(dimension.userDefinedName ?? fieldById(dimension.fieldId, context).label)}`,
    ),
    ...metrics.map((metric, index) => {
      const compiled = metricExpression(metric, context, definitions);
      return `${compiled} AS ${quoteIdentifier(metric.userDefinedName ?? `metric_${index + 1}`)}`;
    }),
  ];
  const parameters: unknown[] = [];
  const conditions: string[] = [];
  const dateRange = context.controlState.dateRange ?? context.dashboard.defaultDateRange;
  const resolved = resolveDateRange(dateRange, context.dashboard.timezone);
  conditions.push(`${fieldExpression(definition.dateRangeFieldId, context)} BETWEEN ? AND ?`);
  parameters.push(resolved.start, resolved.end);
  if (definition.filter) conditions.push(compileFilter(definition.filter, context, parameters));
  for (const control of context.resolvedControls ?? []) {
    if (!control.values.length) continue;
    const field = fieldExpression(control.fieldId, context);
    parameters.push(...control.values);
    conditions.push(`${field} IN (${control.values.map(() => '?').join(', ')})`);
  }
  const source = context.sourceTableName
    ? quoteIdentifier(context.sourceTableName)
    : compileSourceSql(context.dataSource, context.bucketName);
  const groupBy = dimensions.length
    ? ` GROUP BY ${dimensions.map((_, index) => index + 1).join(', ')}`
    : '';
  const orderBy =
    'sort' in definition && definition.sort?.length
      ? ` ORDER BY ${compileSort(definition.sort, dimensions.length, context)}`
      : '';
  const limit = widgetLimit(definition);
  return {
    sql: `SELECT ${select.join(', ')} FROM ${source} WHERE ${conditions.join(' AND ')}${groupBy}${orderBy}${limit ? ` LIMIT ${limit}` : ''}`,
    parameters,
    definitions,
  };
}

export function compileExpressionProbe(
  expression: string,
  context: Omit<QueryContext, 'definition' | 'controlState' | 'dashboard'>,
) {
  assertSingleExpression(expression);
  const source = context.sourceTableName
    ? quoteIdentifier(context.sourceTableName)
    : compileSourceSql(context.dataSource, context.bucketName);
  return `EXPLAIN SELECT ${expression} FROM ${source} LIMIT 1`;
}

function widgetDimensions(definition: WidgetDefinition) {
  if (definition.type === 'line') return [definition.dimension];
  if (definition.type === 'bar' || definition.type === 'pie') {
    return [
      definition.dimension,
      ...(definition.breakdownDimension ? [definition.breakdownDimension] : []),
    ];
  }
  return definition.type === 'table' ? definition.dimensions : [];
}

function widgetMetrics(definition: WidgetDefinition) {
  if (
    definition.type === 'scorecard' ||
    definition.type === 'gauge' ||
    definition.type === 'bar' ||
    definition.type === 'pie'
  )
    return [definition.metric];
  return definition.type === 'line' || definition.type === 'table' ? definition.metrics : [];
}

function metricExpression(
  metric: ReturnType<typeof widgetMetrics>[number],
  context: QueryContext,
  definitions: CompiledQuery['definitions'],
) {
  if (metric.source.kind === 'field') {
    const expression = fieldExpression(metric.source.fieldId, context);
    const aggregation = {
      sum: 'SUM',
      average: 'AVG',
      count: 'COUNT',
      countDistinct: 'COUNT(DISTINCT',
      min: 'MIN',
      max: 'MAX',
      median: 'MEDIAN',
      standardDeviation: 'STDDEV_SAMP',
      variance: 'VAR_SAMP',
    }[metric.source.aggregation];
    return metric.source.aggregation === 'countDistinct'
      ? `COUNT(DISTINCT ${expression})`
      : `${aggregation}(${expression})`;
  }
  if (metric.source.kind === 'expression') {
    assertSingleExpression(metric.source.expression);
    definitions.push({
      name: metric.userDefinedName ?? 'Widget expression',
      expression: metric.source.expression,
      description: null,
    });
    return metric.source.expression;
  }
  const libraryMetricId = metric.source.libraryMetricId;
  const library = context.libraryMetrics.find((item) => item.id === libraryMetricId);
  if (!library) throw new Error(`Unknown library metric ${libraryMetricId}.`);
  assertSingleExpression(library.expression);
  definitions.push({
    name: library.name,
    expression: library.expression,
    description: library.description,
  });
  return rewriteCanonicalNames(library.expression, context);
}

function fieldExpression(fieldId: string, context: QueryContext) {
  const field = context.fields.find((item) => item.id === fieldId);
  if (field) {
    const identifier = quoteIdentifier(field.columnName);
    return field.castTo ? `CAST(${identifier} AS ${safeCast(field.castTo)})` : identifier;
  }
  const calculated = context.calculatedFields.find((item) => item.id === fieldId);
  if (!calculated) throw new Error(`Unknown field ${fieldId}.`);
  assertSingleExpression(calculated.expression);
  return `(${calculated.expression})`;
}

function fieldById(fieldId: string, context: QueryContext) {
  const field = context.fields.find((item) => item.id === fieldId);
  const calculated = context.calculatedFields.find((item) => item.id === fieldId);
  if (!field && !calculated) throw new Error(`Unknown field ${fieldId}.`);
  return field ?? calculated!;
}

function rewriteCanonicalNames(expression: string, context: QueryContext) {
  const fieldsByCanonicalName = new Map(
    [...context.fields, ...context.calculatedFields].map((field) => [
      field.canonicalName.toLocaleLowerCase('en-US'),
      field,
    ]),
  );
  return rewriteSqlIdentifiers(expression, (identifier) => {
    const field = fieldsByCanonicalName.get(identifier.toLocaleLowerCase('en-US'));
    return field ? fieldExpression(field.id, context) : undefined;
  });
}

export function compileLibraryExpression(
  expression: string,
  context: Pick<QueryContext, 'fields' | 'calculatedFields'>,
) {
  assertSingleExpression(expression);
  const replacements = new Map(
    [...context.fields, ...context.calculatedFields].map((field) => [
      field.canonicalName.toLocaleLowerCase('en-US'),
      'columnName' in field ? quoteIdentifier(field.columnName) : `(${field.expression})`,
    ]),
  );
  return rewriteSqlIdentifiers(expression, (identifier) =>
    replacements.get(identifier.toLocaleLowerCase('en-US')),
  );
}

function compileFilter(
  filter: NonNullable<Extract<WidgetDefinition, { type: 'table' }>['filter']>,
  context: QueryContext,
  parameters: unknown[],
) {
  const conditions = filter.conditions.map((condition) => {
    const field = fieldExpression(condition.fieldId, context);
    if (condition.operator === 'isEmpty') return `(${field} IS NULL OR ${field} = '')`;
    if (condition.operator === 'isNotEmpty') return `(${field} IS NOT NULL AND ${field} <> '')`;
    const operators = {
      equals: '=',
      notEquals: '<>',
      greaterThan: '>',
      greaterThanOrEqual: '>=',
      lessThan: '<',
      lessThanOrEqual: '<=',
    } as const;
    if (condition.operator in operators) {
      parameters.push(condition.value);
      return `${field} ${operators[condition.operator as keyof typeof operators]} ?`;
    }
    if (condition.operator === 'contains' || condition.operator === 'notContains') {
      parameters.push(`%${String(condition.value ?? '')}%`);
      return `${field} ${condition.operator === 'notContains' ? 'NOT ' : ''}ILIKE ?`;
    }
    const values = Array.isArray(condition.value) ? condition.value : [condition.value];
    if (!values.length) return condition.operator === 'in' ? 'FALSE' : 'TRUE';
    parameters.push(...values);
    return `${field} ${condition.operator === 'notIn' ? 'NOT ' : ''}IN (${values.map(() => '?').join(', ')})`;
  });
  return `(${conditions.join(filter.connector === 'or' ? ' OR ' : ' AND ') || 'TRUE'})`;
}

function compileSort(
  sort: NonNullable<Extract<WidgetDefinition, { type: 'table' }>['sort']>,
  dimensionCount: number,
  context: QueryContext,
) {
  return sort
    .map((item) =>
      item.target.kind === 'metric'
        ? `${dimensionCount + item.target.index + 1} ${item.direction.toUpperCase()}`
        : `${fieldExpression(item.target.fieldId, context)} ${item.direction.toUpperCase()}`,
    )
    .join(', ');
}

function widgetLimit(definition: WidgetDefinition) {
  if (definition.type === 'table') return definition.resultLimit.amount;
  if (definition.type === 'bar' || definition.type === 'pie') return definition.limit;
  return undefined;
}

export function compileSourceSql(dataSource: DataSourceRecord, bucketName: string) {
  const key =
    dataSource.location.kind === 'prefix'
      ? `${dataSource.location.key}*.${dataSource.location.format}`
      : dataSource.location.key;
  const uri = sqlString(`r2://${bucketName}/${key}`);
  return dataSource.location.format === 'csv'
    ? `read_csv_auto(${uri}, header = true)`
    : `read_parquet(${uri})`;
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}
function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}
function safeCast(value: string) {
  if (!/^[A-Z][A-Z0-9_]*(?:\([0-9, ]+\))?$/iu.test(value))
    throw new Error(`Invalid cast type ${value}.`);
  return value;
}
