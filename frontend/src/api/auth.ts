export type SignInEmailInput = {
  email: string;
  password: string;
};

export type SignedInUser = {
  email: string;
  id?: string;
  image?: string | null;
  name?: string;
  role?: string | null;
  username?: string;
};

export type SignInEmailResult = {
  user: SignedInUser;
};

export type CurrentSessionResult = {
  user: SignedInUser | null;
};

export type SetupStatusResult = {
  noAdmin: boolean;
};

export type SetupAdminInput = {
  email: string;
  username: string;
  password: string;
  name?: string;
};

export type UpdateCurrentUserInput = {
  name: string;
  username: string;
};

export type ChangeCurrentPasswordInput = {
  currentPassword: string;
  newPassword: string;
};

/** Error raised when Better Auth rejects or cannot complete a login request. */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

function getApiOrigin(): string {
  return (import.meta.env.VITE_API_ORIGIN || 'http://localhost:3000').replace(
    /\/$/,
    '',
  );
}

function getApiBaseUrl(): string {
  // Vite's dev proxy uses VITE_API_ORIGIN as the upstream target and avoids
  // browser CORS preflights against Better Auth's generated routes.
  if (import.meta.env.DEV) return '';
  // Empty VITE_API_ORIGIN at build time -> emit relative /api/* URLs so a
  // reverse proxy (e.g. the nginx in the Docker frontend image) can route
  // them on the same origin.
  return import.meta.env.VITE_API_ORIGIN ? getApiOrigin() : '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractErrorMessage(data: unknown): string | null {
  const record = asRecord(data);
  if (!record) {
    return typeof data === 'string' && data.trim() ? data : null;
  }

  for (const key of ['message', 'error', 'reason']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return null;
}

function coerceUserValue(
  user: Record<string, unknown> | null | undefined,
  fallbackEmail?: string,
): SignedInUser | null {
  const email = typeof user?.email === 'string' ? user.email : fallbackEmail;
  if (!email) return null;

  return {
    email,
    id: typeof user?.id === 'string' ? user.id : undefined,
    image:
      typeof user?.image === 'string' || user?.image === null
        ? user.image
        : undefined,
    name: typeof user?.name === 'string' ? user.name : undefined,
    role:
      typeof user?.role === 'string' || user?.role === null
        ? user.role
        : undefined,
    username: typeof user?.username === 'string' ? user.username : undefined,
  };
}

function coerceUser(
  data: unknown,
  fallbackEmail?: string,
): SignedInUser | null {
  const record = asRecord(data);
  return coerceUserValue(asRecord(record?.user), fallbackEmail);
}

async function authFetch(
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const headers = new Headers(init.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });
  const data = await readJson(res);
  if (!res.ok) {
    throw new AuthError(
      extractErrorMessage(data) ?? `Auth request failed (${res.status}).`,
    );
  }
  return data;
}

/** Check whether the instance still needs its first admin account. */
export async function getSetupStatus(): Promise<SetupStatusResult> {
  const res = await fetch(`${getApiBaseUrl()}/api/v1/setup/status`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  });

  if (res.status === 404) {
    return { noAdmin: false };
  }

  const data = await readJson(res);
  if (!res.ok) {
    throw new AuthError(
      extractErrorMessage(data) ?? `Auth request failed (${res.status}).`,
    );
  }

  return {
    noAdmin: asRecord(data)?.noAdmin === true,
  };
}

/** Sign in with Better Auth's email/password endpoint and retain session cookies. */
export async function signInWithEmail(
  input: SignInEmailInput,
): Promise<SignInEmailResult> {
  const data = await authFetch('/api/auth/sign-in/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
    }),
  });

  const user = coerceUser(data, input.email);
  if (!user) throw new AuthError('Sign in succeeded without a user.');

  return {
    user,
  };
}

/** Create the first admin account and reuse the session created by Better Auth. */
export async function setupFirstAdmin(
  input: SetupAdminInput,
): Promise<SignInEmailResult> {
  const data = await authFetch('/api/v1/setup/admin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: input.email,
      username: input.username,
      password: input.password,
      name: input.name,
    }),
  });

  const user = coerceUser(data, input.email);
  if (user) {
    return { user };
  }

  const session = await getCurrentSession();
  if (!session.user) {
    throw new AuthError('Setup succeeded without a user session.');
  }

  return {
    user: session.user,
  };
}

/** Load the current Better Auth cookie-backed session, if one exists. */
export async function getCurrentSession(): Promise<CurrentSessionResult> {
  try {
    const data = await authFetch('/api/auth/get-session');
    return {
      user: coerceUser(data),
    };
  } catch (err) {
    if (err instanceof AuthError) {
      return { user: null };
    }
    throw err;
  }
}

/** Update mutable fields for the signed-in user. */
export async function updateCurrentUser(
  input: UpdateCurrentUserInput,
): Promise<SignedInUser> {
  const data = await authFetch('/api/auth/update-user', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  const fromResponse = coerceUser(data);
  if (fromResponse) return fromResponse;

  const session = await getCurrentSession();
  if (!session.user) throw new AuthError('Could not reload updated profile.');
  return session.user;
}

/** Change the signed-in user's password without revoking the current session. */
export async function changeCurrentPassword(
  input: ChangeCurrentPasswordInput,
): Promise<void> {
  await authFetch('/api/auth/change-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
      revokeOtherSessions: false,
    }),
  });
}

/** End the current Better Auth session. */
export async function signOutSession(): Promise<void> {
  await authFetch('/api/auth/sign-out', {
    method: 'POST',
  });
}
