import { pino, type Level, type LoggerOptions } from 'pino';
import { pinoHttp } from 'pino-http';
import { getLogContext } from './context.js';

const NODE_ENV = process.env.NODE_ENV ?? 'development';
const IS_PROD = NODE_ENV === 'production';
const IS_TEST = NODE_ENV === 'test';

const baseOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? (IS_TEST ? 'silent' : 'info'),
  mixin() {
    const { userId, username } = getLogContext();
    const out: Record<string, unknown> = {};
    if (userId) {
      out.userId = userId;
    }
    if (username) {
      out.username = username;
    }
    return out;
  },
};

const transport =
  !IS_PROD && !IS_TEST
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      }
    : undefined;

const root = pino({
  ...baseOptions,
  ...(transport
    ? {
        transport,
      }
    : {}),
});

export type LogOpts = {
  fn?: string;
  caller?: boolean;
  stack?: boolean;
  level?: Level;
  [key: string]: unknown;
};

const MAGIC_KEYS = new Set(['fn', 'caller', 'stack', 'level']);
const STACK_LINE_RE = /^\s*at\s+(?:(.+?)\s+\()?([^()]+):(\d+):(\d+)\)?$/;

function captureStack(skip: number): string {
  const e = new Error();
  const lines = (e.stack ?? '').split('\n');
  return lines.slice(skip + 1).join('\n');
}

function parseCaller(skip: number):
  | {
      fn?: string;
      file?: string;
      line?: number;
    }
  | undefined {
  const e = new Error();
  const lines = (e.stack ?? '').split('\n');
  const target = lines[skip + 1];
  if (!target) {
    return undefined;
  }
  const m = STACK_LINE_RE.exec(target);
  if (!m) {
    return undefined;
  }
  return {
    fn: m[1] || undefined,
    file: m[2],
    line: Number(m[3]),
  };
}

function isLogOpts(arg: unknown): arg is LogOpts {
  if (arg === null || typeof arg !== 'object' || Array.isArray(arg)) {
    return false;
  }
  for (const k of Object.keys(arg as object)) {
    if (MAGIC_KEYS.has(k)) {
      return true;
    }
  }
  return false;
}

function emit(defaultLevel: Level, args: unknown[]): void {
  const first = args[0];
  if (!isLogOpts(first)) {
    (root[defaultLevel] as (...a: unknown[]) => void)(...args);
    return;
  }
  const opts = first as LogOpts;
  const rest = args.slice(1);
  const merged: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(opts)) {
    if (!MAGIC_KEYS.has(k)) {
      merged[k] = v;
    }
  }

  if (opts.fn) {
    merged.fn = opts.fn;
  }
  if (opts.caller && !merged.fn) {
    const c = parseCaller(3);
    if (c) {
      if (c.fn) {
        merged.fn = c.fn;
      }
      if (c.file) {
        merged.callerFile = c.file;
      }
      if (c.line !== undefined) {
        merged.callerLine = c.line;
      }
    }
  }
  if (opts.stack) {
    merged.stack = captureStack(3);
  }

  const level = opts.level ?? defaultLevel;
  (root[level] as (...a: unknown[]) => void)(merged, ...rest);
}

export const log = {
  trace: (...args: unknown[]) => emit('trace', args),
  debug: (...args: unknown[]) => emit('debug', args),
  info: (...args: unknown[]) => emit('info', args),
  warn: (...args: unknown[]) => emit('warn', args),
  error: (...args: unknown[]) => emit('error', args),
  fatal: (...args: unknown[]) => emit('fatal', args),
};

export const httpLogger = pinoHttp({
  logger: root,
});

export const rootLogger = root;
