import { rewriteSqlIdentifiers } from '../query/sql-identifiers';

interface MetricFieldIdentifier {
  canonicalName: string;
  columnName?: string;
}

export function canonicalMetricExpression(expression: string, fields: MetricFieldIdentifier[]) {
  const canonicalNames = new Map<string, string>();
  for (const field of fields) {
    addIdentifier(canonicalNames, field.canonicalName, field.canonicalName);
    if (field.columnName) addIdentifier(canonicalNames, field.columnName, field.canonicalName);
  }

  return rewriteSqlIdentifiers(expression, (identifier) => {
    const canonicalName = canonicalNames.get(identifier.toLocaleLowerCase('en-US'));
    return canonicalName ? quoteIdentifier(canonicalName) : undefined;
  });
}

function addIdentifier(
  identifiers: Map<string, string>,
  identifier: string,
  canonicalName: string,
) {
  const normalized = identifier.toLocaleLowerCase('en-US');
  const existing = identifiers.get(normalized);
  if (existing && existing !== canonicalName)
    throw new Error(`Ambiguous datasource field identifier: ${identifier}`);
  identifiers.set(normalized, canonicalName);
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}
