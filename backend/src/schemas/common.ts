import { z } from 'zod';
import { isBrowserSessionToken } from '../services/providers/browser-token.js';
import { registry } from './registry.js';

export const HealthResponse = z
  .object({
    status: z.string(),
  })
  .openapi('HealthResponse', {
    example: {
      status: 'ok',
    },
  });

export const ErrorResponse = z
  .object({
    error: z.string(),
  })
  .openapi('ErrorResponse');

export const ReasonErrorResponse = z
  .object({
    ok: z.boolean(),
    reason: z.string(),
    upstreamStatus: z.number().int().nullable().optional(),
  })
  .openapi('ReasonErrorResponse', {
    example: {
      ok: false,
      reason: '...',
      upstreamStatus: 401,
    },
  });

export const ChargePointToken = z
  .any()
  .check((ctx) => {
    if (!isBrowserSessionToken(ctx.value)) {
      ctx.issues.push({
        code: 'custom',
        message: 'token must include non-empty Cookie and User-Agent fields',
        input: ctx.value,
        path: [],
      });
    }
  })
  .transform((value: unknown) => {
    const token = value as {
      Cookie: string;
      'User-Agent': string;
    };
    return {
      Cookie: token.Cookie.trim(),
      'User-Agent': token['User-Agent'].trim(),
    };
  })
  .openapi('ChargePointToken', {
    type: 'object',
    required: ['Cookie', 'User-Agent'],
    properties: {
      Cookie: {
        type: 'string',
      },
      'User-Agent': {
        type: 'string',
      },
    },
    description:
      'Browser session token used by cookie-backed providers such as ChargePoint and SWTCH.',
  });

export type ChargePointTokenValue = z.infer<typeof ChargePointToken>;

registry.register('HealthResponse', HealthResponse);
registry.register('ErrorResponse', ErrorResponse);
registry.register('ReasonErrorResponse', ReasonErrorResponse);
registry.register('ChargePointToken', ChargePointToken);
