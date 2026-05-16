import { type Response as ExpressResponse } from 'express';

/** Get all Set-Cookie headers from a Web Response (Node 18+ undici Headers). */
export function getSetCookies(headers: Headers): string[] {
  const fn = (
    headers as unknown as {
      getSetCookie?: () => string[];
    }
  ).getSetCookie;
  return typeof fn === 'function' ? fn.call(headers) : [];
}

/** Forward Better Auth's bearer-token headers onto an Express response. */
export function forwardAuthHeaders(headers: Headers, res: ExpressResponse): void {
  const authToken = headers.get('set-auth-token');
  if (authToken) {
    res.setHeader('set-auth-token', authToken);
  }

  const exposedHeaders = headers.get('access-control-expose-headers');
  if (exposedHeaders) {
    res.setHeader('access-control-expose-headers', exposedHeaders);
  }
}

/** Forward Set-Cookie + status + body from a Web Response into Express. */
export async function forwardResponse(
  webRes: globalThis.Response,
  res: ExpressResponse,
): Promise<void> {
  forwardAuthHeaders(webRes.headers, res);
  for (const cookie of getSetCookies(webRes.headers)) {
    res.append('Set-Cookie', cookie);
  }
  const contentType = webRes.headers.get('content-type') ?? 'application/json';
  res.status(webRes.status).type(contentType);
  const text = await webRes.text();
  res.send(text);
}
