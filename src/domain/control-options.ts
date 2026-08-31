export function controlOptionsQuery(
  expression: string,
  search: string | undefined,
  direction: string,
) {
  const parameters: unknown[] = [];
  const where = search ? ` WHERE CAST(${expression} AS VARCHAR) ILIKE ?` : '';
  if (search) parameters.push(`%${search}%`);
  const exactFirst = search
    ? `MIN(CASE WHEN CAST(${expression} AS VARCHAR) = ? THEN 0 ELSE 1 END), `
    : '';
  if (search) parameters.push(search);
  return {
    sql: `SELECT ${expression} AS value FROM rundown_source${where} GROUP BY 1 ORDER BY ${exactFirst}1 ${direction} LIMIT 100`,
    parameters,
  };
}
