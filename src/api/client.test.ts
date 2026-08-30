import { afterEach, describe, expect, it, vi } from 'vitest';
import { callApi } from './client';

afterEach(() => vi.unstubAllGlobals());

describe('API client boundary', () => {
  it('surfaces typed API errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json({ ok: false, error: { code: 'invalid_query', message: 'Bad formula.' } }),
        ),
      ),
    );
    await expect(callApi({ action: 'bootstrap' })).rejects.toThrow('Bad formula.');
  });

  it('rejects malformed responses at the network boundary', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ data: 'missing envelope' }))),
    );
    await expect(callApi({ action: 'bootstrap' })).rejects.toThrow('Invalid input');
  });
});
