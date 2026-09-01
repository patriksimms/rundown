import type { DataSourceRecord } from '#/query/types';
import { resolveDatasourceConnector } from './contract';
import { duckdbFileConnector } from './duckdb-file.server';

const connectors = [duckdbFileConnector];

export function datasourceConnector(dataSource: DataSourceRecord | string) {
  return resolveDatasourceConnector(
    typeof dataSource === 'string' ? dataSource : dataSource.connectorType,
    connectors,
  );
}
