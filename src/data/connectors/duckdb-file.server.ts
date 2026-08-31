import { env } from 'cloudflare:workers';
import { collectObjectPages, matchingSourceObjects } from '#/data/listing';
import { headSourceObject, listSourceObjects } from '#/data/source.server';
import { controlOptionsQuery } from '#/domain/control-options';
import { hashJson } from '#/domain/hash';
import {
  assertSingleExpression,
  compileLibraryExpression,
  compileWidgetQuery,
  type CompiledQuery,
} from '#/query/compiler';
import {
  describeDataSource,
  explainIsolatedQuery,
  QueryEngineError,
  runIsolatedPreparedQuery,
} from '#/query/duckdb.server';
import type { DataSourceRecord } from '#/query/types';
import {
  DatasourceError,
  DUCKDB_FILE_CONNECTOR,
  type DatasourceConnector,
  type DatasourceExpression,
  type DatasourceQuery,
  type WidgetDatasourceQuery,
} from './contract';

export const duckdbFileConnector: DatasourceConnector = {
  type: DUCKDB_FILE_CONNECTOR,

  async inspect(dataSource, options) {
    try {
      const { location } = dataSource;
      const objects =
        location.kind === 'object'
          ? [await headSourceObject(location.key)].filter((object) => object !== null)
          : matchingSourceObjects(
              await collectObjectPages((cursor) => listSourceObjects(location.key, cursor)),
              location.format,
            );
      if (!objects.length)
        throw new DatasourceError(
          'datasource_source_not_found',
          'No matching datasource files were found.',
        );
      const maximumObjectBytes = options?.maximumObjectBytes;
      if (
        maximumObjectBytes !== undefined &&
        objects.some((object) => object.size > maximumObjectBytes)
      )
        throw new DatasourceError(
          'datasource_source_too_large',
          'The uploaded file is larger than 100 MB.',
        );
      const version = await hashJson(objects.map((object) => [object.key, object.etag]));
      return { version, ...(await describeDataSource({ ...dataSource, version })) };
    } catch (error) {
      if (error instanceof DatasourceError) throw error;
      throw new DatasourceError(
        'datasource_inspection_failed',
        error instanceof Error ? error.message : 'DuckDB could not inspect this datasource.',
        { cause: error },
      );
    }
  },

  async executeQuery<T extends Record<string, unknown>>(
    dataSource: DataSourceRecord,
    query: DatasourceQuery,
  ) {
    try {
      return await runIsolatedPreparedQuery<T>(dataSource, (sourceTableName) =>
        compileQuery(dataSource, query, sourceTableName),
      );
    } catch (error) {
      throw connectorError(error);
    }
  },

  async validateQuery(dataSource, query) {
    try {
      const compiled = compileWidget(dataSource, query, 'rundown_source');
      await explainIsolatedQuery(dataSource, compiled.sql, compiled.parameters);
    } catch (error) {
      throw connectorError(error, 'invalid_query');
    }
  },

  explainQuery(dataSource, query) {
    try {
      const compiled = compileWidget(dataSource, query, 'rundown_source');
      return { sql: compiled.sql, definitions: compiled.definitions };
    } catch (error) {
      throw connectorError(error, 'invalid_query');
    }
  },

  async validateExpression(dataSource, definition) {
    try {
      const expression = expressionSql(definition);
      await explainIsolatedQuery(
        dataSource,
        `SELECT ${expression} FROM ${quoteIdentifier('rundown_source')} LIMIT 1`,
      );
    } catch (error) {
      throw connectorError(error, 'invalid_query');
    }
  },
};

function compileQuery(
  dataSource: DataSourceRecord,
  query: DatasourceQuery,
  sourceTableName: string,
) {
  if (query.kind === 'widget') return compileWidget(dataSource, query, sourceTableName);
  const expression =
    'columnName' in query.field
      ? quoteIdentifier(query.field.columnName)
      : `(${query.field.expression})`;
  return controlOptionsQuery(
    expression,
    query.search,
    query.direction,
    quoteIdentifier(sourceTableName),
  );
}

function compileWidget(
  dataSource: DataSourceRecord,
  query: WidgetDatasourceQuery,
  sourceTableName: string,
): CompiledQuery {
  return compileWidgetQuery({
    dashboard: query.dashboard,
    definition: query.definition,
    dataSource,
    ...query.metadata,
    controlState: query.controlState,
    bucketName: env.R2_BUCKET_NAME,
    sourceTableName,
    resolvedControls: query.resolvedControls,
    offset: query.offset,
  });
}

function expressionSql(definition: DatasourceExpression) {
  if (definition.kind === 'libraryMetric')
    return compileLibraryExpression(definition.expression, definition.metadata);
  assertSingleExpression(definition.expression);
  return definition.expression;
}

function connectorError(
  error: unknown,
  fallbackCode: 'invalid_query' | 'datasource_connector_failed' = 'datasource_connector_failed',
) {
  if (error instanceof DatasourceError) return error;
  if (error instanceof QueryEngineError && error.kind === 'invalid-query')
    return new DatasourceError('invalid_query', error.message, { cause: error });
  return new DatasourceError(
    error instanceof QueryEngineError ? 'datasource_connector_failed' : fallbackCode,
    error instanceof Error ? error.message : 'The datasource connector failed.',
    { cause: error },
  );
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}
