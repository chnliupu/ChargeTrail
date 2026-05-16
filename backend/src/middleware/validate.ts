import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

type ErrorShape = 'error' | 'reason';

function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'invalid request';
}

function respond(res: Response, message: string, shape: ErrorShape): void {
  if (shape === 'reason') {
    res.status(400).json({
      ok: false,
      reason: message,
    });
  } else {
    res.status(400).json({
      error: message,
    });
  }
}

export function validateBody<S extends z.ZodType>(
  schema: S,
  options: {
    errorShape?: ErrorShape;
  } = {},
) {
  const shape = options.errorShape ?? 'error';
  return (req: Request, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      respond(res, firstIssueMessage(parsed.error), shape);
      return;
    }
    res.locals.body = parsed.data;
    req.body = parsed.data;
    next();
  };
}

export function validateQuery<S extends z.ZodType>(
  schema: S,
  options: {
    errorShape?: ErrorShape;
  } = {},
) {
  const shape = options.errorShape ?? 'error';
  return (req: Request, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      respond(res, firstIssueMessage(parsed.error), shape);
      return;
    }
    // Express 5 makes req.query a getter; stash the parsed result on res.locals
    // and have handlers read from there instead of mutating req.query.
    res.locals.query = parsed.data;
    next();
  };
}

export function getValidatedBody<T>(res: Response): T {
  return res.locals.body as T;
}

export function getValidatedQuery<T>(res: Response): T {
  return res.locals.query as T;
}
