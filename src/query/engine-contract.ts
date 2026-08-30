export type QueryEngineRequest =
  | {
      operation: 'isolatedQuery';
      sourceSql: string;
      requiresR2Credentials: boolean;
      sql: string;
      parameters: unknown[];
    }
  | {
      operation: 'describeSource';
      sourceSql: string;
      requiresR2Credentials: boolean;
    };

export type QueryEngineResponse<T> = { ok: true; data: T } | { ok: false; error: string };
