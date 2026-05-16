import { fromNodeHeaders } from 'better-auth/node';
import type { NextFunction, Request, Response } from 'express';
import { getAuth } from './auth.js';

export type AuthedUser = {
  id: string;
  email: string;
  username: string;
  role: string | null | undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
      sessionToken?: string;
    }
  }
}

async function loadSession(req: Request) {
  const auth = getAuth();
  return auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await loadSession(req);
    if (!result?.user) {
      res.status(401).json({
        error: 'unauthenticated',
      });
      return;
    }
    req.user = result.user as unknown as AuthedUser;
    req.sessionToken = result.session?.token;
    next();
  } catch {
    res.status(500).json({
      error: 'auth check failed',
    });
  }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await loadSession(req);
    if (!result?.user) {
      res.status(401).json({
        error: 'unauthenticated',
      });
      return;
    }
    const user = result.user as unknown as AuthedUser;
    if (user.role !== 'admin') {
      res.status(403).json({
        error: 'admin required',
      });
      return;
    }
    req.user = user;
    req.sessionToken = result.session?.token;
    next();
  } catch {
    res.status(500).json({
      error: 'auth check failed',
    });
  }
}
