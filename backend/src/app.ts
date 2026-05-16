import express, { type Express, type Request, type Response } from 'express';
import { toNodeHandler } from 'better-auth/node';
import { adminUsersRouter } from './routes/admin-users.js';
import { authRouter } from './routes/auth.js';
import { connectorsRouter } from './routes/connectors.js';
import { invitesRouter } from './routes/invites.js';
import { sessionsRouter } from './routes/sessions.js';
import { setupRouter } from './routes/setup.js';
import { getAuth } from './services/auth/auth.js';
import { requireAuth } from './services/auth/middleware.js';
import { httpLogger } from './services/logger/index.js';
import { logContextMiddleware } from './services/logger/middleware.js';
import { mountSwagger } from './services/swagger/index.js';

export function createApp(): Express {
  const app = express();
  app.use(logContextMiddleware);
  app.use(httpLogger);

  // Better Auth handler MUST be mounted before express.json() — BA parses
  // the request body itself.
  app.all('/api/auth/*splat', toNodeHandler(getAuth()));

  app.use(express.json());
  mountSwagger(app);

  app.get('/api/v1/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
    });
  });

  // Public: first-run admin bootstrap (404s once an admin exists).
  app.use('/api/v1', setupRouter);

  // Public: invite-gated registration.
  app.use('/api/v1', authRouter);

  // Authenticated routes (any logged-in user).
  app.use('/api/v1', requireAuth, connectorsRouter);
  app.use('/api/v1', requireAuth, sessionsRouter);

  // Admin-only routes (admin check is inside each router).
  app.use('/api/v1', invitesRouter);
  app.use('/api/v1', adminUsersRouter);

  return app;
}
