export type QueryEngineRequest =
  | {
      operation: 'isolatedQuery';
      sourceSql: string;
      sql: string;
      parameters: unknown[];
    }
  | {
      operation: 'describeSource';
      sourceSql: string;
    };

export type QueryEngineResponse<T> = { ok: true; data: T } | { ok: false; error: string };
