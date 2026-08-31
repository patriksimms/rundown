import { apiResponseSchema, type ApiRequest } from './contracts';

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function callApi<T>(request: ApiRequest): Promise<T> {
  const response = await fetch('/api/rundown', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  const body = apiResponseSchema.parse(await response.json());
  if (!body.ok) throw new ApiClientError(body.error.code, body.error.message);
  return body.data as T;
}
