import { describe, expect, it, vi } from 'vitest';
import { collectObjectPages, matchingSourceObjects, type ObjectPage } from './listing';

describe('paginated object listings', () => {
  it('collects more than 1,000 objects in stable page order', async () => {
    const first = Array.from({ length: 1_000 }, (_, index) => ({ key: `part-${index}` }));
    const load = vi.fn<(cursor?: string) => Promise<ObjectPage<{ key: string }>>>((cursor) =>
      Promise.resolve(
        cursor
          ? { objects: [{ key: 'part-1000' }], truncated: false }
          : { objects: first, truncated: true, cursor: 'next' },
      ),
    );
    const objects = await collectObjectPages(load);
    expect(objects).toHaveLength(1_001);
    expect(objects.at(-1)).toEqual({ key: 'part-1000' });
    expect(load).toHaveBeenNthCalledWith(2, 'next');
  });

  it('rejects a truncated page without a cursor', async () => {
    await expect(
      collectObjectPages(() => Promise.resolve({ objects: [], truncated: true })),
    ).rejects.toThrow('without a cursor');
  });

  it('filters the requested format and sorts keys for stable hashes', () => {
    expect(
      matchingSourceObjects(
        [{ key: 'prefix/z.csv' }, { key: 'prefix/a.CSV' }, { key: 'prefix/b.parquet' }],
        'csv',
      ),
    ).toEqual([{ key: 'prefix/a.CSV' }, { key: 'prefix/z.csv' }]);
  });
});
