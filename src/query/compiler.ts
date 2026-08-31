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
  offset?: number;
}

export interface CompiledQuery {
  sql: string;
  parameters: unknown[];
  definitions: Array<{ name: string; expression: string; description: string | null }>;
}

export function assertSingleExpression(expression: string) {
  if (expression.includes(';') || /--|\/\*/u.test(expression) || hasTopLevelAlias(expression))
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
      (dimension, index) =>
        `${fieldExpression(dimension.fieldId, context)} AS ${quoteIdentifier(`dimension_${index + 1}`)}`,
    ),
    ...metrics.map((metric, index) => {
      const compiled = metricExpression(metric, context, definitions);
      return `${compiled} AS ${quoteIdentifier(`metric_${index + 1}`)}`;
    }),
    ...(definition.type === 'gauge' && definition.upperLimit?.kind === 'library'
      ? [
          `${metricExpression(
            {
              source: { kind: 'library', libraryMetricId: definition.upperLimit.libraryMetricId },
              dataType: 'number',
            },
            context,
            definitions,
          )} AS "upper_limit"`,
        ]
      : []),
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
  const explicitSort =
    'sort' in definition && definition.sort?.length
      ? compileSort(definition.sort, dimensions.length, context)
      : undefined;
  const stableDimensions = dimensions.map((_, index) => `${index + 1} ASC`).join(', ');
  const order = [explicitSort, stableDimensions].filter(Boolean).join(', ');
  const orderBy = order ? ` ORDER BY ${order}` : '';
  const limit = widgetLimit(definition);
  return {
    sql: `SELECT ${select.join(', ')} FROM ${source} WHERE ${conditions.join(' AND ')}${groupBy}${orderBy}${limit ? ` LIMIT ${context.offset === undefined ? limit : limit + 1}` : ''}${context.offset ? ` OFFSET ${context.offset}` : ''}`,
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

function rewriteCanonicalNames(expression: string, context: QueryContext) {
  const fieldsByCanonicalName = new Map(
    [...context.calculatedFields, ...context.fields].map((field) => [
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
    [...context.calculatedFields, ...context.fields].map((field) => [
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
  return compileSourceSqlFromBaseUrl(dataSource, `r2://${bucketName}`);
}

export function compileSourceSqlFromBaseUrl(
  dataSource: DataSourceRecord,
  baseUrl: string,
  objectKeys?: string[],
) {
  const key =
    dataSource.location.kind === 'prefix'
      ? `${dataSource.location.key}*.${dataSource.location.format}`
      : dataSource.location.key;
  const keys = objectKeys ?? [key];
  const uris = keys.map((objectKey) => sqlString(sourceUrl(baseUrl, objectKey)));
  const source = uris.length === 1 ? uris[0] : `[${uris.join(', ')}]`;
  return dataSource.location.format === 'csv'
    ? `read_csv_auto(${source}, header = true)`
    : `read_parquet(${source})`;
}

function sourceUrl(baseUrl: string, key: string) {
  const base = baseUrl.replace(/\/$/u, '');
  if (base.startsWith('r2://')) return `${base}/${key}`;
  return `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
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

function hasTopLevelAlias(expression: string) {
  let depth = 0;
  for (let index = 0; index < expression.length;) {
    const character = expression[index];
    if (character === "'" || character === '"') {
      index = quotedEnd(expression, index, character);
      continue;
    }
    if (character === '$') {
      const end = dollarQuotedEnd(expression, index);
      if (end !== undefined) {
        index = end;
        continue;
      }
    }
    if (character === '(') depth += 1;
    else if (character === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      const word = expression.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/u)?.[0];
      if (word) {
        if (word.toLocaleLowerCase('en-US') === 'as') return true;
        index += word.length;
        continue;
      }
    }
    index += 1;
  }
  return false;
}

function dollarQuotedEnd(expression: string, start: number) {
  const tag = expression.slice(start).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/u)?.[0];
  if (!tag) return undefined;
  const closing = expression.indexOf(tag, start + tag.length);
  return closing === -1 ? expression.length : closing + tag.length;
}

function quotedEnd(expression: string, start: number, quote: "'" | '"') {
  let index = start + 1;
  while (index < expression.length) {
    if (expression[index] !== quote) {
      index += 1;
      continue;
    }
    if (expression[index + 1] === quote) {
      index += 2;
      continue;
    }
    return index + 1;
  }
  return expression.length;
}
