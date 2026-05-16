export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function getApiBaseUrl(): string {
  if (import.meta.env.DEV) return '';
  const origin = import.meta.env.VITE_API_ORIGIN ?? 'http://localhost:3000';
  return origin.replace(/\/$/, '');
}

type QueryValue = string | number | boolean | null | undefined | string[];
type QueryParams = Record<string, QueryValue>;

function buildQueryString(params?: QueryParams): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      search.set(key, value.join(','));
      continue;
    }
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return typeof body === 'string' && body.trim() ? body : null;
  }
  const record = body as Record<string, unknown>;
  for (const key of ['message', 'error', 'reason']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

export async function apiGet<T>(
  path: string,
  params?: QueryParams,
): Promise<T> {
  const url = `${getApiBaseUrl()}${path}${buildQueryString(params)}`;
  const res = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  const body = await readBody(res);
  if (!res.ok) {
    throw new ApiError(
      extractMessage(body) ?? `Request failed (${res.status})`,
      res.status,
      body,
    );
  }
  return body as T;
}

async function apiSend<T>(
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  params?: QueryParams,
): Promise<T> {
  const url = `${getApiBaseUrl()}${path}${buildQueryString(params)}`;
  const init: RequestInit = {
    method,
    credentials: 'include',
    headers: { Accept: 'application/json' },
  };
  if (body !== undefined) {
    (init.headers as Record<string, string>)['Content-Type'] =
      'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const respBody = await readBody(res);
  if (!res.ok) {
    throw new ApiError(
      extractMessage(respBody) ?? `Request failed (${res.status})`,
      res.status,
      respBody,
    );
  }
  return respBody as T;
}

export function apiPost<T>(
  path: string,
  body?: unknown,
  params?: QueryParams,
): Promise<T> {
  return apiSend<T>('POST', path, body, params);
}

export function apiPatch<T>(
  path: string,
  body?: unknown,
  params?: QueryParams,
): Promise<T> {
  return apiSend<T>('PATCH', path, body, params);
}

export function apiDelete<T>(path: string, params?: QueryParams): Promise<T> {
  return apiSend<T>('DELETE', path, undefined, params);
}
