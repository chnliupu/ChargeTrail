import { Router, type Request, type Response } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { getAuth } from '../services/auth/auth.js';
import { requireAdmin } from '../services/auth/middleware.js';
import { log } from '../services/logger/index.js';
import { validateBody, getValidatedBody } from '../middleware/validate.js';
import { SetPasswordRequest, type SetPasswordRequestValue } from '../schemas/admin.js';

export const adminUsersRouter: Router = Router();

adminUsersRouter.use(requireAdmin);

adminUsersRouter.post(
  '/admin/users/:id/password',
  validateBody(SetPasswordRequest),
  async (req: Request, res: Response) => {
    const { newPassword } = getValidatedBody<SetPasswordRequestValue>(res);
    const auth = getAuth();
    try {
      const setPwd = auth.api.setUserPassword as unknown as (args: {
        body: {
          newPassword: string;
          userId: string;
        };
        headers: Headers;
      }) => Promise<unknown>;
      await setPwd({
        body: {
          newPassword,
          userId: String(req.params.id),
        },
        headers: fromNodeHeaders(req.headers),
      });
      res.status(204).end();
    } catch (err) {
      log.error(
        {
          fn: 'admin.setPassword',
          err,
        },
        'setUserPassword failed',
      );
      res.status(500).json({
        error: 'could not set password',
      });
    }
  },
);
