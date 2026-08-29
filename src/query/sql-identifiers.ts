type IdentifierReplacement = (identifier: string) => string | undefined;

const sqlReservedWords = new Set(
  'all analyse analyze and anti any array as asc asof asymmetric at authorization binary both by case cast check collate collation column columns concurrently constraint create cross default deferrable desc describe distinct do else end except false fetch for foreign freeze from full generated glob group having ilike in initially inner intersect into is isnull join lambda lateral leading left like limit map natural not notnull null offset on only or order outer overlaps pivot pivot_longer pivot_wider placing positional primary qualify references returning right select semi show similar some struct summarize symmetric table tablesample then to trailing true try_cast union unique unpack unpivot using variadic verbose when where window with'.split(
    ' ',
  ),
);
const sqlSpecialValues = new Set([
  'current_date',
  'current_time',
  'current_timestamp',
  'localtime',
  'localtimestamp',
]);
const sqlTypeNames = new Set(
  'bigint bit blob bool boolean bpchar bytea char character date decimal double enum float float4 float8 hugeint int int1 int2 int4 int8 integer interval json list map numeric real signed smallint struct text time timestamp timestamptz timetz tinyint ubigint uhugeint uint union unsigned usmallint utinyint uuid varbinary varchar varint'.split(
    ' ',
  ),
);
const sqlTypeModifiers = new Set(['precision', 'varying', 'with', 'without', 'time', 'zone']);
const intervalUnits = new Set(
  'microsecond microseconds millisecond milliseconds second seconds minute minutes hour hours day days week weeks month months quarter quarters year years decade decades century centuries millennium millennia'.split(
    ' ',
  ),
);

export function rewriteSqlIdentifiers(expression: string, replacementFor: IdentifierReplacement) {
  let result = '';
  for (let index = 0; index < expression.length;) {
    const character = expression[index];
    if (character === "'") {
      const end = quotedEnd(expression, index, "'");
      result += expression.slice(index, end);
      index = end;
      continue;
    }
    if (character === '$') {
      const end = dollarQuotedEnd(expression, index);
      if (end !== undefined) {
        result += expression.slice(index, end);
        index = end;
        continue;
      }
    }
    if (character === '"') {
      const end = quotedEnd(expression, index, '"');
      const identifier = expression.slice(index + 1, end - 1).replaceAll('""', '"');
      result += replacementFor(identifier) ?? expression.slice(index, end);
      index = end;
      continue;
    }
    const word = expression.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/u)?.[0];
    if (word) {
      result += isSqlSyntaxWord(expression, index, word) ? word : (replacementFor(word) ?? word);
      index += word.length;
      continue;
    }
    result += character;
    index += 1;
  }
  return result;
}

export function referencedSqlIdentifiers(expression: string) {
  const identifiers = new Set<string>();
  rewriteSqlIdentifiers(expression, (identifier) => {
    identifiers.add(identifier.toLocaleLowerCase('en-US'));
    return undefined;
  });
  return [...identifiers];
}

function isSqlSyntaxWord(expression: string, index: number, word: string) {
  const normalized = word.toLocaleLowerCase('en-US');
  if (sqlReservedWords.has(normalized) || sqlSpecialValues.has(normalized)) return true;
  const following = expression.slice(index + word.length).match(/^\s*(.)/u)?.[1];
  if (following === '(' || following === "'") return true;

  const preceding = expression.slice(0, index);
  const typeToken = sqlTypeNames.has(normalized) || sqlTypeModifiers.has(normalized);
  if (typeToken && /\bas\s+(?:[A-Za-z_][A-Za-z0-9_]*\s*)*$/iu.test(preceding)) return true;
  if (typeToken && /::\s*(?:[A-Za-z_][A-Za-z0-9_]*\s*)*$/u.test(preceding)) return true;
  return (
    intervalUnits.has(normalized) &&
    /\binterval\s+(?:'(?:''|[^'])*'|[+-]?\d+(?:\.\d+)?)\s*$/iu.test(preceding)
  );
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
