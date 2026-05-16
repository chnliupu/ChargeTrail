import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  FLO_SESSION_HISTORY_URL,
  validateBrowserToken,
} from '../../../../src/services/providers/flo/auth.js';

const FIXTURES = join(process.cwd(), 'test/services/providers/flo/fixtures');
function readFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

describe('FLO auth', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    warnMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function htmlResponse(body: string, status = 200): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(),
      text: async () => body,
    } as unknown as Response;
  }

  it('accepts the authenticated session history page', async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse(readFixture('flo-example.html')));

    const result = await validateBrowserToken({
      Cookie: 'session=randomized',
      'User-Agent': 'Random Test Browser',
    });

    expect(result).toEqual({ valid: true, status: 200 });
    expect(fetchMock).toHaveBeenCalledWith(
      FLO_SESSION_HISTORY_URL,
      expect.objectContaining({
        method: 'GET',
        redirect: 'manual',
        headers: expect.objectContaining({
          Cookie: 'session=randomized',
          'User-Agent': 'Random Test Browser',
        }),
      }),
    );
  });

  it('rejects the guest sign-in page as invalid token', async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse(readFixture('flo-auth-failed.html')));

    const result = await validateBrowserToken({
      Cookie: 'session=expired',
      'User-Agent': 'Random Test Browser',
    });

    expect(result).toEqual({
      valid: false,
      status: 200,
      reason: 'invalid-token',
    });
  });

  it('treats redirects to /Account/Login as invalid token', async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse('', 302));

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
    fetchMock.mockResolvedValueOnce(htmlResponse('', 503));

    const result = await validateBrowserToken({
      Cookie: 'session=randomized',
      'User-Agent': 'Random Test Browser',
    });

    expect(result.valid).toBe(false);
    if (result.valid) {
      return;
    }
    expect(result.reason).toBe('upstream-error');
    expect(result.status).toBe(503);
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
    expect(warnMock).toHaveBeenCalled();
  });

  it('rejects malformed tokens without making a request', async () => {
    const result = await validateBrowserToken({
      Cookie: '   ',
      'User-Agent': 'Random Test Browser',
    });
    expect(result.valid).toBe(false);
    if (result.valid) {
      return;
    }
    expect(result.reason).toBe('request-failed');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
