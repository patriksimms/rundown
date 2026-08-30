import { describe, expect, it } from 'vitest';
import { executeQueryEngineRequest } from './query-engine';

const environment = {
  CLOUDFLARE_ACCOUNT_ID: 'test',
  R2_ACCESS_KEY_ID: 'test',
  R2_SECRET_ACCESS_KEY: 'test',
};
const sourceSql = '(VALUES (1, 10), (2, 20)) AS source(day, spend)';

describe('native query engine', () => {
  it('materializes an authorized source and binds query parameters', async () => {
    await expect(
      executeQueryEngineRequest(
        {
          operation: 'isolatedQuery',
          sourceSql,
          requiresR2Credentials: false,
          sql: 'SELECT SUM(spend) AS total FROM rundown_source WHERE day >= ?',
          parameters: [2],
        },
        {},
      ),
    ).resolves.toEqual([{ total: '20' }]);
  });

  it('requires credentials only for R2 sources', async () => {
    await expect(
      executeQueryEngineRequest(
        { operation: 'describeSource', sourceSql, requiresR2Credentials: true },
        {},
      ),
    ).rejects.toThrow(/R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY|CLOUDFLARE_ACCOUNT_ID/u);
    await expect(
      executeQueryEngineRequest(
        { operation: 'describeSource', sourceSql, requiresR2Credentials: true },
        environment,
      ),
    ).resolves.toMatchObject({
      samples: [
        { day: 1, spend: 10 },
        { day: 2, spend: 20 },
      ],
    });
  });

  it('disables external access before compiling user expressions', async () => {
    await expect(
      executeQueryEngineRequest(
        {
          operation: 'isolatedQuery',
          sourceSql,
          requiresR2Credentials: false,
          sql: "SELECT * FROM read_csv_auto('/etc/passwd')",
          parameters: [],
        },
        {},
      ),
    ).rejects.toThrow(/operations are disabled by configuration/iu);
  });

  it('describes and samples a trusted source', async () => {
    const result = await executeQueryEngineRequest(
      { operation: 'describeSource', sourceSql, requiresR2Credentials: false },
      {},
    );
    expect(result).toMatchObject({
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
