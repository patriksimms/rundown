export interface ObjectPage<T> {
  objects: T[];
  truncated: boolean;
  cursor?: string;
}

export function paginateObjects<T>(objects: T[], cursor?: string, limit = 1_000): ObjectPage<T> {
  const offset = cursor === undefined ? 0 : Number(cursor);
  if (!Number.isSafeInteger(offset) || offset < 0)
    throw new Error('Invalid object listing cursor.');
  const nextOffset = offset + limit;
  const truncated = nextOffset < objects.length;
  return {
    objects: objects.slice(offset, nextOffset),
    truncated,
    cursor: truncated ? String(nextOffset) : undefined,
  };
}

export async function collectObjectPages<T>(load: (cursor?: string) => Promise<ObjectPage<T>>) {
  const objects: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await load(cursor);
    objects.push(...page.objects);
    if (page.truncated && !page.cursor) throw new Error('Object listing ended without a cursor.');
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return objects;
}

export function matchingSourceObjects<T extends { key: string }>(
  objects: T[],
  format: 'csv' | 'parquet',
) {
  return objects
    .filter((object) => object.key.toLowerCase().endsWith(`.${format}`))
    .sort((left, right) => left.key.localeCompare(right.key));
}
