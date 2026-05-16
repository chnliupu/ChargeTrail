import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchConnectors } from './connectors';

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
    ...init,
  });
}

describe('connectors API helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists connectors without session counts by default', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ connectors: [{ id: 'c-1' }] }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchConnectors();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/connector',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
      }),
    );
  });

  it('requests connector session counts only when asked', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ connectors: [{ id: 'c-1', sessionCount: 3 }] }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await fetchConnectors({ withSessionCount: true });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/connector?withSessionCount=true',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
      }),
    );
  });
});
