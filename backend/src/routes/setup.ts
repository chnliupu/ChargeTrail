import { Router, type Request, type Response as ExpressResponse } from 'express';
import { eq } from 'drizzle-orm';
import { getAuth } from '../services/auth/auth.js';
import { getDb } from '../services/db/index.js';
import { user } from '../services/db/schema.js';
import { log } from '../services/logger/index.js';
import { validateBody, getValidatedBody } from '../middleware/validate.js';
import { SetupAdminRequest, type SetupAdminRequestValue } from '../schemas/auth.js';
import { forwardAuthHeaders, forwardResponse, getSetCookies } from './_baForward.js';

export const setupRouter: Router = Router();

/** True once any user has been promoted to the admin role. */
function adminExists(): boolean {
  const row = getDb()
    .select({
      id: user.id,
    })
    .from(user)
    .where(eq(user.role, 'admin'))
    .get();
  return Boolean(row);
}

/**
 * Whole setup surface is invisible once configured: every endpoint here 404s
 * as soon as an admin exists, matching the Portainer/Gitea bootstrap pattern.
 */
setupRouter.use('/setup', (_req: Request, res: ExpressResponse, next) => {
  if (adminExists()) {
    res.status(404).json({
      error: 'not found',
    });
    return;
  }
  next();
});

setupRouter.get('/setup/status', (_req: Request, res: ExpressResponse) => {
  res.json({
    noAdmin: true,
  });
});

setupRouter.post(
  '/setup/admin',
  validateBody(SetupAdminRequest),
  async (_req: Request, res: ExpressResponse) => {
    const body = getValidatedBody<SetupAdminRequestValue>(res);

    const auth = getAuth();
    // `username` is a custom additional field; BA's public types don't
    // surface additionalFields on the server-API body, so we widen.
    const signUp = auth.api.signUpEmail as unknown as (args: {
      body: Record<string, unknown>;
      asResponse: true;
    }) => Promise<globalThis.Response>;

    let baRes: globalThis.Response;
    try {
      baRes = await signUp({
        body: {
          email: body.email,
          password: body.password,
          name: body.name ?? body.username,
          username: body.username,
        },
        asResponse: true,
      });
    } catch (err) {
      log.error(
        {
          fn: 'setup.admin',
          err,
        },
        'signUpEmail threw',
      );
      res.status(500).json({
        error: 'setup failed',
      });
      return;
    }

    if (!baRes.ok) {
      await forwardResponse(baRes, res);
      return;
    }

    const text = await baRes.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    const userId = (
      json as {
        user?: {
          id?: string;
        };
      } | null
    )?.user?.id;
    if (!userId) {
      log.error(
        {
          fn: 'setup.admin',
        },
        'signUpEmail returned without a user id; admin not promoted',
      );
      res.status(500).json({
        error: 'setup failed',
      });
      return;
    }

    // Re-check right before promotion so a racing request can't create a
    // second "first admin". better-sqlite3 is synchronous/single-process,
    // so this check-then-promote is effectively atomic.
    const db = getDb();
    if (adminExists()) {
      res.status(404).json({
        error: 'not found',
      });
      return;
    }
    db.update(user)
      .set({
        role: 'admin',
      })
      .where(eq(user.id, userId))
      .run();
    log.info(
      {
        fn: 'setup.admin',
        username: body.username,
      },
      'created first admin via web setup',
    );

    forwardAuthHeaders(baRes.headers, res);
    for (const cookie of getSetCookies(baRes.headers)) {
      res.append('Set-Cookie', cookie);
    }
    res
      .status(baRes.status)
      .type(baRes.headers.get('content-type') ?? 'application/json')
      .send(text);
  },
);
