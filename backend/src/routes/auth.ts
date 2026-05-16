import { Router, type Request, type Response as ExpressResponse } from 'express';
import { getAuth } from '../services/auth/auth.js';
import { attachInviteUser, claimInvite, releaseInvite } from '../services/auth/invite.js';
import { log } from '../services/logger/index.js';
import { validateBody, getValidatedBody } from '../middleware/validate.js';
import { RegisterRequest, type RegisterRequestValue } from '../schemas/auth.js';
import { forwardAuthHeaders, forwardResponse, getSetCookies } from './_baForward.js';

export const authRouter: Router = Router();

authRouter.post(
  '/auth/register',
  validateBody(RegisterRequest),
  async (_req: Request, res: ExpressResponse) => {
    const body = getValidatedBody<RegisterRequestValue>(res);

    const claimed = claimInvite(body.invite);
    if (!claimed) {
      res.status(400).json({
        error: 'invite is invalid, expired, or already used',
      });
      return;
    }

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
      releaseInvite(claimed.id);
      log.error(
        {
          fn: 'auth.register',
          err,
        },
        'signUpEmail threw',
      );
      res.status(500).json({
        error: 'registration failed',
      });
      return;
    }

    if (!baRes.ok) {
      releaseInvite(claimed.id);
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
    if (userId) {
      attachInviteUser(claimed.id, userId);
    }

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
