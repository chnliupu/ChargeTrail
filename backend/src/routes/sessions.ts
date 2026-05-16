import { Router, type Request, type Response } from 'express';
import { getDb } from '../services/db/index.js';
import { listSessions } from '../services/sessions/list.js';
import { validateQuery, getValidatedQuery } from '../middleware/validate.js';
import { SessionsQuery, type SessionFilters } from '../schemas/sessions.js';

export const sessionsRouter: Router = Router();

sessionsRouter.get(
  '/sessions',
  validateQuery(SessionsQuery, {
    errorShape: 'reason',
  }),
  (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        error: 'unauthenticated',
      });
      return;
    }

    const filters = getValidatedQuery<SessionFilters>(res);
    const result = listSessions(getDb(), {
      userId,
      filters,
    });
    res.json({
      ok: true,
      ...result,
    });
  },
);
