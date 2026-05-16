import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  changeCurrentPassword,
  getCurrentSession,
  getSetupStatus,
  signOutSession,
  setupFirstAdmin,
  updateCurrentUser,
} from './auth';

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
    ...init,
  });
}

describe('auth API helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads the current session user with custom fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        user: {
          email: 'ada@example.com',
          id: 'u-1',
          image: null,
          name: 'Ada',
          role: 'admin',
          username: 'ada',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getCurrentSession()).resolves.toEqual({
      user: {
        email: 'ada@example.com',
        id: 'u-1',
        image: null,
        name: 'Ada',
        role: 'admin',
        username: 'ada',
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/get-session',
      expect.objectContaining({
        credentials: 'include',
      }),
    );
  });

  it('updates only mutable profile fields', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: true }))
      .mockResolvedValueOnce(
        jsonResponse({
          user: {
            email: 'ada@example.com',
            name: 'Ada Lovelace',
            username: 'ada-l',
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await updateCurrentUser({
      name: 'Ada Lovelace',
      username: 'ada-l',
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init.body))).toEqual({
      name: 'Ada Lovelace',
      username: 'ada-l',
    });
  });

  it('changes password without revoking other sessions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ token: null }));
    vi.stubGlobal('fetch', fetchMock);

    await changeCurrentPassword({
      currentPassword: 'current-pass',
      newPassword: 'new-pass-123',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/change-password',
      expect.objectContaining({
        credentials: 'include',
        method: 'POST',
      }),
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init.body))).toEqual({
      currentPassword: 'current-pass',
      newPassword: 'new-pass-123',
      revokeOtherSessions: false,
    });
  });

  it('signs out through Better Auth', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ success: true }));
    vi.stubGlobal('fetch', fetchMock);

    await signOutSession();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/sign-out',
      expect.objectContaining({
        credentials: 'include',
        method: 'POST',
      }),
    );
  });

  it('treats setup status 404 as already configured', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getSetupStatus()).resolves.toEqual({ noAdmin: false });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/setup/status',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
      }),
    );
  });

  it('loads setup status while no admin exists', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ noAdmin: true }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getSetupStatus()).resolves.toEqual({ noAdmin: true });
  });

  it('creates the first admin and uses the returned user', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        user: {
          email: 'ada@example.com',
          id: 'u-1',
          name: 'Ada',
          role: 'admin',
          username: 'ada',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      setupFirstAdmin({
        email: 'ada@example.com',
        username: 'ada',
        password: 'super-secret',
        name: 'Ada',
      }),
    ).resolves.toEqual({
      user: {
        email: 'ada@example.com',
        id: 'u-1',
        image: undefined,
        name: 'Ada',
        role: 'admin',
        username: 'ada',
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/setup/admin',
      expect.objectContaining({
        credentials: 'include',
        method: 'POST',
      }),
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init.body))).toEqual({
      email: 'ada@example.com',
      username: 'ada',
      password: 'super-secret',
      name: 'Ada',
    });
  });
});
