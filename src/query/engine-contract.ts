export type QueryEngineRequest =
  | {
      operation: 'query';
      sql: string;
      parameters: unknown[];
    }
  | {
      operation: 'describeSource';
      sourceSql: string;
    }
  | {
      operation: 'ingestCsv';
      sourceUrl: string;
      destinationUrl: string;
    };

export interface QueryEngineMetrics {
  queryDurationMs: number;
  resultBytes: number;
}

export type QueryEngineResponse<T> =
  | { ok: true; data: T; metrics: QueryEngineMetrics }
  | { ok: false; error: string };
