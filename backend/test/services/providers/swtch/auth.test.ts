import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { warnMock } = vi.hoisted(() => ({
  warnMock: vi.fn(),
}));

vi.mock('../../../../src/services/logger/index.js', () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: warnMock,
    error: vi.fn(),
  },
}));

import {
  SWTCH_ACTIVITIES_URL,
  validateBrowserToken,
} from '../../../../src/services/providers/swtch/auth.js';

describe('SWTCH auth', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    warnMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function response(status: number, headers = new Headers()): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers,
      text: async () => '',
    } as unknown as Response;
  }

  it('accepts HTTP 200 and sends the provided browser headers', async () => {
    fetchMock.mockResolvedValueOnce(response(200));

    const result = await validateBrowserToken({
      Cookie: 'session=randomized',
      'User-Agent': 'Random Test Browser',
    });

    expect(result).toEqual({
      valid: true,
      status: 200,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      SWTCH_ACTIVITIES_URL,
      expect.objectContaining({
        method: 'GET',
        redirect: 'manual',
        headers: expect.objectContaining({
          Cookie: 'session=randomized',
          'User-Agent': 'Random Test Browser',
          Accept: expect.stringContaining('text/html'),
        }),
      }),
    );
  });

  it('rejects redirects and auth failures as invalid tokens', async () => {
    fetchMock.mockResolvedValueOnce(
      response(
        302,
        new Headers({
          location: '/login',
        }),
      ),
    );

    const result = await validateBrowserToken({
      Cookie: 'session=randomized',
      'User-Agent': 'Random Test Browser',
    });

    expect(result).toEqual({
      valid: false,
      status: 302,
      reason: 'invalid-token',
    });
  });

  it('treats 5xx responses as upstream errors', async () => {
    fetchMock.mockResolvedValueOnce(response(503));

    const result = await validateBrowserToken({
      Cookie: 'session=randomized',
      'User-Agent': 'Random Test Browser',
    });

    expect(result).toEqual({
      valid: false,
      status: 503,
      reason: 'upstream-error',
    });
  });

  it('reports thrown fetch failures', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    const result = await validateBrowserToken({
      Cookie: 'session=randomized',
      'User-Agent': 'Random Test Browser',
    });

    expect(result).toEqual({
      valid: false,
      status: null,
      reason: 'request-failed',
    });
    expect(warnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fn: 'swtch.validateBrowserToken',
        err: 'network down',
      }),
      'token validation request failed',
    );
  });
});
