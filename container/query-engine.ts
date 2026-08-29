import { DuckDBInstance, type DuckDBValue } from '@duckdb/node-api';
import { z } from 'zod';

const runtimeConfigSchema = z.object({
  CLOUDFLARE_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
});
export const queryEngineRequestSchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('isolatedQuery'),
    sourceSql: z.string().min(1),
    sql: z.string().min(1),
    parameters: z.array(z.unknown()).default([]),
  }),
  z.object({ operation: z.literal('describeSource'), sourceSql: z.string().min(1) }),
]);

export async function executeQueryEngineRequest(input: unknown, environment: unknown) {
  const request = queryEngineRequestSchema.parse(input);
  const config = runtimeConfigSchema.parse(environment);
  const instance = await DuckDBInstance.create(':memory:');
  const connection = await instance.connect();
  try {
    await connection.run(
      `CREATE SECRET rundown_r2 (TYPE R2, KEY_ID ${sqlString(config.R2_ACCESS_KEY_ID)}, SECRET ${sqlString(config.R2_SECRET_ACCESS_KEY)}, ACCOUNT_ID ${sqlString(config.CLOUDFLARE_ACCOUNT_ID)})`,
    );
    if (request.operation === 'describeSource') {
      const description = await connection.runAndReadAll(
        `DESCRIBE SELECT * FROM ${request.sourceSql}`,
      );
      const samples = await connection.runAndReadAll(`SELECT * FROM ${request.sourceSql} LIMIT 20`);
      return {
        description: description.getRowObjectsJson(),
        samples: samples.getRowObjectsJson(),
      };
    }

    await connection.run(`CREATE TEMP TABLE rundown_source AS SELECT * FROM ${request.sourceSql}`);
    await connection.run('SET enable_external_access = false');
    const statement = await connection.prepare(request.sql);
    statement.bind(request.parameters as DuckDBValue[]);
    const result = await statement.runAndReadAll();
    return result.getRowObjectsJson();
  } finally {
    connection.closeSync();
  }
}

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}
