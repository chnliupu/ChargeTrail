import { AsyncLocalStorage } from 'node:async_hooks';

export interface LogContext {
  userId?: string;
  username?: string;
}

const storage = new AsyncLocalStorage<LogContext>();

export function getLogContext(): LogContext {
  return storage.getStore() ?? {};
}

export function runWithLogContext<T>(ctx: LogContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function setLogContext(patch: Partial<LogContext>): void {
  const current = storage.getStore();
  if (!current) {
    return;
  }
  Object.assign(current, patch);
}
