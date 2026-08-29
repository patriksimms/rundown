import { DuckDB, init, sanitizeSql } from '@ducklings/workers';
import type { QueryEngineRequest } from '../src/query/engine-contract';

export interface QueryWorkerEnv {
  CLOUDFLARE_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
}

export function createQueryEngine(wasmModule: WebAssembly.Module) {
  const initialized = init({ wasmModule });
  let pending = Promise.resolve();

  return (request: QueryEngineRequest, environment: QueryWorkerEnv) => {
    const result = pending.then(
      () => execute(request, environment, initialized),
      () => execute(request, environment, initialized),
    );
    pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}

async function execute(
  request: QueryEngineRequest,
  environment: QueryWorkerEnv,
  initialized: Promise<void>,
) {
  assertEnvironment(environment);
  await initialized;
  const database = new DuckDB({ lockConfiguration: false });
  const connection = database.connect();
  try {
    await connection.execute(
      `CREATE SECRET rundown_r2 (TYPE R2, KEY_ID ${sqlString(environment.R2_ACCESS_KEY_ID)}, SECRET ${sqlString(environment.R2_SECRET_ACCESS_KEY)}, ACCOUNT_ID ${sqlString(environment.CLOUDFLARE_ACCOUNT_ID)})`,
    );
    await connection.execute(
      `CREATE TEMP TABLE rundown_source AS SELECT * FROM ${request.sourceSql}`,
    );
    await connection.execute('SET enable_external_access = false');

    if (request.operation === 'describeSource') {
      return {
        description: await connection.query('DESCRIBE rundown_source'),
        samples: await connection.query('SELECT * FROM rundown_source LIMIT 20'),
      };
    }

    const statement = connection.prepare(sanitizeSql(request.sql));
    try {
      request.parameters.forEach((value, index) => statement.bind(index + 1, value));
      return await statement.run();
    } finally {
      statement.close();
    }
  } finally {
    connection.close();
    database.close();
  }
}

function assertEnvironment(environment: QueryWorkerEnv) {
  if (
    !environment.CLOUDFLARE_ACCOUNT_ID ||
    !environment.R2_ACCESS_KEY_ID ||
    !environment.R2_SECRET_ACCESS_KEY
  )
    throw new Error('Query engine R2 credentials are not configured.');
}

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}
