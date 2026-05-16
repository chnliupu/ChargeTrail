import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAllSessions, fetchSessions } from './sessions';

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function emptyPage() {
  return jsonResponse({
    ok: true,
    sessions: [],
    pagination: {
      limit: 200,
      offset: 0,
      count: 0,
      total: 0,
      hasMore: false,
      nextOffset: null,
    },
  });
}

describe('fetchSessions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('serializes dateRange as a comma-joined ISO pair', async () => {
    const fetchMock = vi.fn().mockResolvedValue(emptyPage());
    vi.stubGlobal('fetch', fetchMock);

    await fetchSessions({
      dateRange: {
        from: '2026-04-01T00:00:00.000Z',
        to: '2026-04-30T23:59:59.999Z',
      },
    });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain(
      'dateRange=2026-04-01T00%3A00%3A00.000Z%2C2026-04-30T23%3A59%3A59.999Z',
    );
  });

  it('omits dateRange when not provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(emptyPage());
    vi.stubGlobal('fetch', fetchMock);

    await fetchSessions({ limit: 50 });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).not.toContain('dateRange');
  });
});

describe('fetchAllSessions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('walks pagination until hasMore is false', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          sessions: [{ id: 'a' }],
          pagination: {
            limit: 200,
            offset: 0,
            count: 1,
            total: 2,
            hasMore: true,
            nextOffset: 200,
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          sessions: [{ id: 'b' }],
          pagination: {
            limit: 200,
            offset: 200,
            count: 1,
            total: 2,
            hasMore: false,
            nextOffset: null,
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const res = await fetchAllSessions();
    expect(res.sessions).toHaveLength(2);
    expect(res.truncated).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Second call uses the server-provided nextOffset.
    expect(fetchMock.mock.calls[1][0]).toContain('offset=200');
  });

  it('stops at the row cap and reports truncated', async () => {
    const sessions = Array.from({ length: 200 }, (_, i) => ({ id: `s-${i}` }));
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        ok: true,
        sessions,
        pagination: {
          limit: 200,
          offset: 0,
          count: 200,
          total: 9999,
          hasMore: true,
          nextOffset: 200,
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await fetchAllSessions({}, 200);
    expect(res.sessions).toHaveLength(200);
    expect(res.truncated).toBe(true);
  });
});
