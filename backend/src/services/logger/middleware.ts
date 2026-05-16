import type { NextFunction, Request, Response } from 'express';
import { runWithLogContext } from './context.js';

export function logContextMiddleware(_req: Request, _res: Response, next: NextFunction): void {
  runWithLogContext({}, () => next());
}
