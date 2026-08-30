import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { createQueryEngine } from './engine';

const environment = {
  CLOUDFLARE_ACCOUNT_ID: '',
  R2_ACCESS_KEY_ID: '',
  R2_SECRET_ACCESS_KEY: '',
};
const sourceSql = '(VALUES (1, 10), (2, 20)) AS source(day, spend)';
let execute: ReturnType<typeof createQueryEngine>;

beforeAll(async () => {
  const bytes = await readFile('node_modules/@ducklings/workers/dist/wasm/duckdb-workers.wasm');
  execute = createQueryEngine(await WebAssembly.compile(bytes));
});

describe('Ducklings query engine', () => {
  it('requires credentials only for R2 sources', async () => {
    await expect(
      execute(
        {
          operation: 'describeSource',
          sourceSql,
          requiresR2Credentials: true,
        },
        environment,
      ),
    ).rejects.toThrow('Query engine R2 credentials are not configured.');
  });

  it('materializes the authorized source and binds parameters', async () => {
    await expect(
      execute(
        {
          operation: 'isolatedQuery',
          sourceSql,
          requiresR2Credentials: false,
          sql: 'SELECT SUM(spend) AS total FROM rundown_source WHERE day >= ?',
          parameters: [2],
        },
        environment,
      ),
    ).resolves.toEqual([{ total: 20 }]);
  });

  it('disables external access before user SQL runs', async () => {
    await expect(
      execute(
        {
          operation: 'isolatedQuery',
          sourceSql,
          requiresR2Credentials: false,
          sql: "SELECT * FROM read_csv_auto('/etc/passwd')",
          parameters: [],
        },
        environment,
      ),
    ).rejects.toThrow(/operations are disabled by configuration/iu);
  });

  it('describes and samples the materialized source', async () => {
    await expect(
      execute(
        { operation: 'describeSource', sourceSql, requiresR2Credentials: false },
        environment,
      ),
    ).resolves.toMatchObject({
      description: [
        { column_name: 'day', column_type: 'INTEGER' },
        { column_name: 'spend', column_type: 'INTEGER' },
      ],
      samples: [
        { day: 1, spend: 10 },
        { day: 2, spend: 20 },
      ],
    });
  });
});
