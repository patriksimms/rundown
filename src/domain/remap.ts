import { widgetDefinitionSchema, type WidgetDefinition } from './schema';

interface FieldIdentity {
  id: string;
  canonicalName: string;
  columnName?: string;
  expression?: string;
}

interface RemapMetadata {
  fields: FieldIdentity[];
  calculatedFields: FieldIdentity[];
}

type Metric = Extract<WidgetDefinition, { type: 'scorecard' }>['metric'];
type Dimension = Extract<WidgetDefinition, { type: 'line' }>['dimension'];
type Filter = NonNullable<Extract<WidgetDefinition, { type: 'scorecard' }>['filter']>;
type Sort = NonNullable<Extract<WidgetDefinition, { type: 'table' }>['sort']>;

export function remapWidgetDefinition(
  definition: WidgetDefinition,
  source: RemapMetadata,
  targetDataSourceId: string,
  target: RemapMetadata,
) {
  if (!('dataSourceId' in definition)) return definition;
  const targetByCanonicalName = uniqueCanonicalFields(target);
  const fieldIdMap = new Map(
    [...source.fields, ...source.calculatedFields].map((field) => [
      field.id,
      targetByCanonicalName.get(field.canonicalName)?.id,
    ]),
  );
  const expressionFields = expressionFieldMap(source.fields, targetByCanonicalName);
  const fieldId = (id: string) => {
    const replacement = fieldIdMap.get(id);
    if (!replacement) throw new Error(`Target datasource has no canonical field for ${id}.`);
    return replacement;
  };
  const filter = (value: Filter | undefined) =>
    value
      ? {
          ...value,
          conditions: value.conditions.map((condition) => ({
            ...condition,
            fieldId: fieldId(condition.fieldId),
          })),
        }
      : undefined;
  const metric = (value: Metric): Metric => ({
    ...value,
    source:
      value.source.kind === 'field'
        ? { ...value.source, fieldId: fieldId(value.source.fieldId) }
        : value.source.kind === 'expression'
          ? {
              ...value.source,
              expression: rewriteSqlIdentifiers(value.source.expression, expressionFields),
            }
          : value.source,
  });
  const dimension = (value: Dimension): Dimension => ({
    ...value,
    fieldId: fieldId(value.fieldId),
  });
  const sort = (value: Sort | undefined): Sort | undefined =>
    value?.map((item) => ({
      ...item,
      target:
        item.target.kind === 'dimension'
          ? { ...item.target, fieldId: fieldId(item.target.fieldId) }
          : item.target,
    }));
  const common = {
    ...definition,
    dataSourceId: targetDataSourceId,
    ...('dateRangeFieldId' in definition
      ? { dateRangeFieldId: fieldId(definition.dateRangeFieldId) }
      : {}),
    filter: filter(definition.filter),
  };

  if (definition.type === 'control')
    return widgetDefinitionSchema.parse({ ...common, fieldId: fieldId(definition.fieldId) });
  if (definition.type === 'scorecard' || definition.type === 'gauge')
    return widgetDefinitionSchema.parse({ ...common, metric: metric(definition.metric) });
  if (definition.type === 'line')
    return widgetDefinitionSchema.parse({
      ...common,
      dimension: dimension(definition.dimension),
      metrics: definition.metrics.map(metric),
    });
  if (definition.type === 'bar' || definition.type === 'pie')
    return widgetDefinitionSchema.parse({
      ...common,
      metric: metric(definition.metric),
      dimension: dimension(definition.dimension),
      breakdownDimension: definition.breakdownDimension
        ? dimension(definition.breakdownDimension)
        : undefined,
      sort: sort(definition.sort),
    });
  return widgetDefinitionSchema.parse({
    ...common,
    dimensions: definition.dimensions.map(dimension),
    metrics: definition.metrics.map(metric),
    sort: sort(definition.sort),
  });
}

function uniqueCanonicalFields(metadata: RemapMetadata) {
  const fields = new Map<string, FieldIdentity>();
  for (const field of [...metadata.fields, ...metadata.calculatedFields]) {
    if (fields.has(field.canonicalName))
      throw new Error(`Target datasource has ambiguous canonical field ${field.canonicalName}.`);
    fields.set(field.canonicalName, field);
  }
  return fields;
}

interface ExpressionField {
  source: FieldIdentity;
  target?: FieldIdentity;
}

const sqlReservedWords = new Set(
  'all analyse analyze and anti any array as asc asof asymmetric at authorization binary both by case cast check collate collation column columns concurrently constraint create cross default deferrable desc describe distinct do else end except false fetch for foreign freeze from full generated glob group having ilike in initially inner intersect into is isnull join lambda lateral leading left like limit map natural not notnull null offset on only or order outer overlaps pivot pivot_longer pivot_wider placing positional primary qualify references returning right select semi show similar some struct summarize symmetric table tablesample then to trailing true try_cast union unique unpack unpivot using variadic verbose when where window with'.split(
    ' ',
  ),
);
const sqlTypeNames = new Set(
  'bigint bit blob bool boolean bpchar char character date decimal double enum float hugeint int integer interval json list map numeric real smallint struct text time timestamp timestamptz timetz tinyint ubigint uhugeint uint union usmallint utinyint uuid varbinary varchar varint'.split(
    ' ',
  ),
);
const sqlTypeModifiers = new Set(['precision', 'varying', 'with', 'without', 'time', 'zone']);

function expressionFieldMap(
  sourceFields: FieldIdentity[],
  targetByCanonicalName: ReadonlyMap<string, FieldIdentity>,
) {
  const fields = new Map<string, ExpressionField[]>();
  for (const source of sourceFields) {
    if (!source.columnName) continue;
    const identifier = source.columnName.toLocaleLowerCase('en-US');
    fields.set(identifier, [
      ...(fields.get(identifier) ?? []),
      { source, target: targetByCanonicalName.get(source.canonicalName) },
    ]);
  }
  return fields;
}

function rewriteSqlIdentifiers(expression: string, fields: ReadonlyMap<string, ExpressionField[]>) {
  let result = '';
  for (let index = 0; index < expression.length;) {
    const character = expression[index];
    if (character === "'") {
      const end = quotedEnd(expression, index, "'");
      result += expression.slice(index, end);
      index = end;
      continue;
    }
    if (character === '"') {
      const end = quotedEnd(expression, index, '"');
      const identifier = expression.slice(index + 1, end - 1).replaceAll('""', '"');
      result += expressionField(identifier, fields) ?? expression.slice(index, end);
      index = end;
      continue;
    }
    const word = expression.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/u)?.[0];
    if (word) {
      result += isSqlSyntaxWord(expression, index, word)
        ? word
        : (expressionField(word, fields) ?? word);
      index += word.length;
      continue;
    }
    result += character;
    index += 1;
  }
  return result;
}

function isSqlSyntaxWord(expression: string, index: number, word: string) {
  const normalized = word.toLocaleLowerCase('en-US');
  if (sqlReservedWords.has(normalized)) return true;
  const following = expression.slice(index + word.length).match(/^\s*(.)/u)?.[1];
  if (following === '(' || following === "'") return true;
  const preceding = expression.slice(0, index).match(/([A-Za-z_][A-Za-z0-9_]*)\s*$/u)?.[1];
  if (preceding?.toLocaleLowerCase('en-US') === 'as' && sqlTypeNames.has(normalized)) return true;
  const postfixCast = expression.slice(0, index).match(/::\s*([A-Za-z_][A-Za-z0-9_]*\s*)*$/u);
  return Boolean(postfixCast && (sqlTypeNames.has(normalized) || sqlTypeModifiers.has(normalized)));
}

function expressionField(identifier: string, fields: ReadonlyMap<string, ExpressionField[]>) {
  const matches = fields.get(identifier.toLocaleLowerCase('en-US'));
  if (!matches) return undefined;
  if (matches.length > 1)
    throw new Error(`Source datasource has ambiguous field identifier ${identifier}.`);
  const [{ source, target }] = matches;
  if (!target)
    throw new Error(
      `Target datasource has no canonical field ${source.canonicalName} for expression identifier ${identifier}.`,
    );
  if (target.columnName) return quoteIdentifier(target.columnName);
  if (target.expression) return `(${target.expression})`;
  throw new Error(
    `Target canonical field ${source.canonicalName} cannot be used in an expression.`,
  );
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

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
