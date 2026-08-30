import { apiResponseSchema, type ApiRequest } from './contracts';

export async function callApi<T>(request: ApiRequest): Promise<T> {
  const response = await fetch('/api/rundown', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  const body = apiResponseSchema.parse(await response.json());
  if (!body.ok) throw new Error(body.error.message);
  return body.data as T;
}
