import { DuckDBInstance } from '@duckdb/node-api';

const instance = await DuckDBInstance.create(':memory:');
const connection = await instance.connect();

try {
  await connection.run('INSTALL httpfs');
} finally {
  connection.closeSync();
  instance.closeSync();
}
