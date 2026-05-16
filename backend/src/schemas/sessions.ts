import { z } from 'zod';
import { ErrorResponse, ReasonErrorResponse } from './common.js';
import { registry } from './registry.js';

const DEFAULT_FETCH_LIMIT = 50;
const MAX_LIMIT = 200;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export const Session = z
  .object({
    id: z.string(),
    userId: z.string(),
    connectorId: z.string().nullable(),
    provider: z.string().nullable(),
    providerSessionId: z.string().nullable(),
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime().nullable(),
    powerKwh: z.number(),
    durationSeconds: z.number().int().min(0),
    price: z.number(),
    pricePerHour: z.number().nullable(),
    pricePerKwh: z.number().nullable(),
    currency: z.string().nullable(),
    lat: z.number().nullable(),
    lon: z.number().nullable(),
    address1: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    zipcode: z.string().nullable(),
    country: z.string().nullable(),
    deviceName: z.string().nullable(),
    deviceId: z.number().int().nullable(),
    vehicleId: z.number().int().nullable(),
  })
  .openapi('Session');

export const SessionsResponse = z
  .object({
    ok: z.boolean(),
    sessions: z.array(Session),
    pagination: z.object({
      limit: z.number().int().min(1),
      offset: z.number().int().min(0),
      count: z.number().int().min(0),
      total: z.number().int().min(0),
      hasMore: z.boolean(),
      nextOffset: z.number().int().nullable(),
    }),
  })
  .openapi('SessionsResponse');

registry.register('Session', Session);
registry.register('SessionsResponse', SessionsResponse);

// ---- Query parsing helpers ---------------------------------------------------

type ParseCtx = {
  issues: {
    code: 'custom';
    message: string;
    input: unknown;
    path?: (string | number)[];
  }[];
};

function fail(ctx: ParseCtx, message: string, input: unknown): typeof z.NEVER {
  ctx.issues.push({
    code: 'custom',
    message,
    input,
  });
  return z.NEVER;
}

function getSingleValueString(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const v of value) {
      if (typeof v === 'string' && v.trim().length > 0) {
        return v.trim();
      }
    }
    return undefined;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}

function getMultiValueString(value: unknown): string[] {
  if (value === undefined) {
    return [];
  }
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((item) => (typeof item === 'string' ? [item] : []))
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseInteger(value: string, name: string, ctx: ParseCtx): number | undefined {
  if (!/^\d+$/.test(value)) {
    fail(ctx, `${name} must be a non-negative integer`, value);
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    fail(ctx, `${name} must be a safe integer`, value);
    return undefined;
  }
  return parsed;
}

function parseFiniteNumber(value: string, name: string, ctx: ParseCtx): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    fail(ctx, `${name} must be a finite number`, value);
    return undefined;
  }
  return parsed;
}

function parseTimestamp(value: string, name: string, ctx: ParseCtx): string | undefined {
  if (!ISO_TIMESTAMP_PATTERN.test(value)) {
    fail(ctx, `${name} must be an ISO-8601 timestamp string`, value);
    return undefined;
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    fail(ctx, `${name} must be a valid ISO-8601 timestamp string`, value);
    return undefined;
  }
  return new Date(ms).toISOString();
}

function splitRange(value: string): [string, string] | null {
  const normalized = value
    .trim()
    .replace(/^[[{(]/, '')
    .replace(/[\]})]$/, '');
  const parts = normalized.split(',').map((p) => p.trim());
  if (parts.length !== 2 || parts.some((p) => p.length === 0)) {
    return null;
  }
  return [parts[0], parts[1]];
}

function resolveAlias<T>(
  primary: T | undefined,
  alias: T | undefined,
  primaryName: string,
  aliasName: string,
  ctx: ParseCtx,
): T | undefined {
  if (primary !== undefined && alias !== undefined && primary !== alias) {
    fail(ctx, `${primaryName} and ${aliasName} must match when both are provided`, {
      primary,
      alias,
    });
    return undefined;
  }
  return primary ?? alias;
}

function parseConnectorIds(query: Record<string, unknown>): string[] {
  return [...getMultiValueString(query.connectorId), ...getMultiValueString(query.connector)]
    .flatMap((value) =>
      value
        .replace(/^[[{(]/, '')
        .replace(/[\]})]$/, '')
        .split(','),
    )
    .map((v) => v.trim())
    .filter((v, i, all) => v.length > 0 && all.indexOf(v) === i);
}

export type SessionFilters = {
  limit: number;
  offset: number;
  startedAtFrom?: string;
  startedAtTo?: string;
  endedAtFrom?: string;
  endedAtTo?: string;
  priceMin?: number;
  priceMax?: number;
  pricePerKwhMin?: number;
  pricePerKwhMax?: number;
  pricePerHourMin?: number;
  pricePerHourMax?: number;
  energyKwhMin?: number;
  energyKwhMax?: number;
  durationSecondsMin?: number;
  durationSecondsMax?: number;
  connectorIds: string[];
  deviceId?: number;
  vehicleId?: number;
  city?: string;
  state?: string;
  country?: string;
  currency?: string;
};

function parseAliasedInteger(
  query: Record<string, unknown>,
  primaryName: string,
  aliasName: string,
  defaultValue: number,
  ctx: ParseCtx,
): number {
  const primary = getSingleValueString(query[primaryName]);
  const alias = getSingleValueString(query[aliasName]);
  if (primary === undefined && alias === undefined) {
    return defaultValue;
  }

  const sourceName = primary !== undefined ? primaryName : aliasName;
  const value = parseInteger(primary ?? alias!, sourceName, ctx);
  if (value === undefined) {
    return defaultValue;
  }

  if (primary !== undefined && alias !== undefined) {
    const aliasValue = parseInteger(alias, aliasName, ctx);
    if (aliasValue === undefined) {
      return value;
    }
    if (value !== aliasValue) {
      fail(ctx, `${primaryName} and ${aliasName} must match when both are provided`, {
        primary,
        alias,
      });
    }
  }
  return value;
}

function parseOptionalScalar<T>(
  query: Record<string, unknown>,
  name: string,
  parse: (value: string, name: string, ctx: ParseCtx) => T | undefined,
  ctx: ParseCtx,
): T | undefined {
  const value = getSingleValueString(query[name]);
  if (value === undefined) {
    return undefined;
  }
  return parse(value, name, ctx);
}

function parseTimestampRange(
  query: Record<string, unknown>,
  name: string,
  ctx: ParseCtx,
): {
  from?: string;
  to?: string;
} {
  const value = getSingleValueString(query[name]);
  if (value === undefined) {
    return {};
  }
  const range = splitRange(value);
  if (!range) {
    fail(ctx, `${name} must contain exactly two comma-separated timestamps`, value);
    return {};
  }
  const from = parseTimestamp(range[0], `${name} start`, ctx);
  const to = parseTimestamp(range[1], `${name} end`, ctx);
  return {
    from,
    to,
  };
}

function parseNumberRange(
  query: Record<string, unknown>,
  name: string,
  ctx: ParseCtx,
): {
  min?: number;
  max?: number;
} {
  const value = getSingleValueString(query[name]);
  if (value === undefined) {
    return {};
  }
  const range = splitRange(value);
  if (!range) {
    fail(ctx, `${name} must contain exactly two comma-separated numbers`, value);
    return {};
  }
  const min = parseFiniteNumber(range[0], `${name} lower`, ctx);
  const max = parseFiniteNumber(range[1], `${name} upper`, ctx);
  return {
    min,
    max,
  };
}

export const SessionsQuery = z
  .record(z.string(), z.unknown())
  .transform((query, zCtx): SessionFilters => {
    const ctx: ParseCtx = {
      issues: [],
    };

    const limit = parseAliasedInteger(query, 'limit', 'count', DEFAULT_FETCH_LIMIT, ctx);
    if (ctx.issues.length === 0 && (limit < 1 || limit > MAX_LIMIT)) {
      fail(ctx, `limit must be between 1 and ${MAX_LIMIT}`, limit);
    }
    const offset = parseAliasedInteger(query, 'offset', 'start', 0, ctx);

    const dateRange = parseTimestampRange(query, 'dateRange', ctx);
    const startedAtFromRaw = parseOptionalScalar(query, 'startedAtFrom', parseTimestamp, ctx);
    const startedAtToRaw = parseOptionalScalar(query, 'startedAtTo', parseTimestamp, ctx);
    const startedAtFrom = resolveAlias(
      startedAtFromRaw,
      dateRange.from,
      'startedAtFrom',
      'dateRange start',
      ctx,
    );
    const startedAtTo = resolveAlias(
      startedAtToRaw,
      dateRange.to,
      'startedAtTo',
      'dateRange end',
      ctx,
    );

    const endedAtFrom = parseOptionalScalar(query, 'endedAtFrom', parseTimestamp, ctx);
    const endedAtTo = parseOptionalScalar(query, 'endedAtTo', parseTimestamp, ctx);

    const priceRange = parseNumberRange(query, 'totalPrice', ctx);
    const priceMinRaw = parseOptionalScalar(query, 'priceMin', parseFiniteNumber, ctx);
    const priceMaxRaw = parseOptionalScalar(query, 'priceMax', parseFiniteNumber, ctx);
    const priceMin = resolveAlias(priceMinRaw, priceRange.min, 'priceMin', 'totalPrice lower', ctx);
    const priceMax = resolveAlias(priceMaxRaw, priceRange.max, 'priceMax', 'totalPrice upper', ctx);

    const unitPriceRange = parseNumberRange(query, 'unitPriceRange', ctx);
    const pricePerKwhMinRaw = parseOptionalScalar(query, 'pricePerKwhMin', parseFiniteNumber, ctx);
    const pricePerKwhMaxRaw = parseOptionalScalar(query, 'pricePerKwhMax', parseFiniteNumber, ctx);
    const pricePerKwhMin = resolveAlias(
      pricePerKwhMinRaw,
      unitPriceRange.min,
      'pricePerKwhMin',
      'unitPriceRange lower',
      ctx,
    );
    const pricePerKwhMax = resolveAlias(
      pricePerKwhMaxRaw,
      unitPriceRange.max,
      'pricePerKwhMax',
      'unitPriceRange upper',
      ctx,
    );

    const pricePerHourMin = parseOptionalScalar(query, 'pricePerHourMin', parseFiniteNumber, ctx);
    const pricePerHourMax = parseOptionalScalar(query, 'pricePerHourMax', parseFiniteNumber, ctx);
    const energyKwhMin = parseOptionalScalar(query, 'energyKwhMin', parseFiniteNumber, ctx);
    const energyKwhMax = parseOptionalScalar(query, 'energyKwhMax', parseFiniteNumber, ctx);
    const durationSecondsMin = parseOptionalScalar(query, 'durationSecondsMin', parseInteger, ctx);
    const durationSecondsMax = parseOptionalScalar(query, 'durationSecondsMax', parseInteger, ctx);
    const deviceId = parseOptionalScalar(query, 'deviceId', parseInteger, ctx);
    const vehicleId = parseOptionalScalar(query, 'vehicleId', parseInteger, ctx);

    for (const [name, min, max] of [
      ['startedAt', startedAtFrom, startedAtTo],
      ['endedAt', endedAtFrom, endedAtTo],
    ] as const) {
      if (min !== undefined && max !== undefined && min > max) {
        fail(ctx, `${name} lower bound must be less than or equal to upper bound`, {
          min,
          max,
        });
      }
    }

    for (const [name, min, max] of [
      ['price', priceMin, priceMax],
      ['pricePerKwh', pricePerKwhMin, pricePerKwhMax],
      ['pricePerHour', pricePerHourMin, pricePerHourMax],
      ['energyKwh', energyKwhMin, energyKwhMax],
      ['durationSeconds', durationSecondsMin, durationSecondsMax],
    ] as const) {
      if (min !== undefined && max !== undefined && min > max) {
        fail(ctx, `${name} lower bound must be less than or equal to upper bound`, {
          min,
          max,
        });
      }
    }

    if (ctx.issues.length > 0) {
      for (const issue of ctx.issues) {
        zCtx.issues.push(issue);
      }
      return z.NEVER as never;
    }

    return {
      limit,
      offset,
      startedAtFrom,
      startedAtTo,
      endedAtFrom,
      endedAtTo,
      priceMin,
      priceMax,
      pricePerKwhMin,
      pricePerKwhMax,
      pricePerHourMin,
      pricePerHourMax,
      energyKwhMin,
      energyKwhMax,
      durationSecondsMin,
      durationSecondsMax,
      connectorIds: parseConnectorIds(query),
      deviceId,
      vehicleId,
      city: getSingleValueString(query.city),
      state: getSingleValueString(query.state),
      country: getSingleValueString(query.country),
      currency: getSingleValueString(query.currency),
    };
  });

const sessionQueryParametersOpenApi = [
  {
    name: 'limit',
    schema: {
      type: 'integer',
      minimum: 1,
      maximum: 200,
      default: 50,
    },
    description: 'Maximum number of sessions to return. Alias: count.',
  },
  {
    name: 'count',
    schema: {
      type: 'integer',
      minimum: 1,
      maximum: 200,
    },
    description: 'Alias for limit. Must match limit if both are provided.',
  },
  {
    name: 'offset',
    schema: {
      type: 'integer',
      minimum: 0,
      default: 0,
    },
    description: 'Offset for pagination. Alias: start.',
  },
  {
    name: 'start',
    schema: {
      type: 'integer',
      minimum: 0,
    },
    description: 'Alias for offset. Must match offset if both are provided.',
  },
  {
    name: 'dateRange',
    schema: {
      type: 'string',
      example: '2026-04-01T00:00:00.000Z,2026-04-30T23:59:59.999Z',
    },
    description: 'Two ISO-8601 timestamps separated by a comma, applied to startedAt.',
  },
  {
    name: 'startedAtFrom',
    schema: {
      type: 'string',
      format: 'date-time',
    },
  },
  {
    name: 'startedAtTo',
    schema: {
      type: 'string',
      format: 'date-time',
    },
  },
  {
    name: 'endedAtFrom',
    schema: {
      type: 'string',
      format: 'date-time',
    },
  },
  {
    name: 'endedAtTo',
    schema: {
      type: 'string',
      format: 'date-time',
    },
  },
  {
    name: 'totalPrice',
    schema: {
      type: 'string',
      example: '2,10',
    },
    description: 'Two comma-separated numbers for total session price range.',
  },
  {
    name: 'priceMin',
    schema: {
      type: 'number',
    },
  },
  {
    name: 'priceMax',
    schema: {
      type: 'number',
    },
  },
  {
    name: 'unitPriceRange',
    schema: {
      type: 'string',
      example: '0.4,0.8',
    },
    description: 'Two comma-separated numbers for pricePerKwh range.',
  },
  {
    name: 'pricePerKwhMin',
    schema: {
      type: 'number',
    },
  },
  {
    name: 'pricePerKwhMax',
    schema: {
      type: 'number',
    },
  },
  {
    name: 'pricePerHourMin',
    schema: {
      type: 'number',
    },
  },
  {
    name: 'pricePerHourMax',
    schema: {
      type: 'number',
    },
  },
  {
    name: 'energyKwhMin',
    schema: {
      type: 'number',
    },
  },
  {
    name: 'energyKwhMax',
    schema: {
      type: 'number',
    },
  },
  {
    name: 'durationSecondsMin',
    schema: {
      type: 'integer',
      minimum: 0,
    },
  },
  {
    name: 'durationSecondsMax',
    schema: {
      type: 'integer',
      minimum: 0,
    },
  },
  {
    name: 'connectorId',
    schema: {
      type: 'string',
      example: 'connector-1,connector-2',
    },
    description: 'Connector id or comma-separated connector ids.',
  },
  {
    name: 'connector',
    schema: {
      type: 'string',
      example: '[connector-1]',
    },
    description: 'Alias for connectorId.',
  },
  {
    name: 'deviceId',
    schema: {
      type: 'integer',
      minimum: 0,
    },
  },
  {
    name: 'vehicleId',
    schema: {
      type: 'integer',
      minimum: 0,
    },
  },
  {
    name: 'city',
    schema: {
      type: 'string',
    },
  },
  {
    name: 'state',
    schema: {
      type: 'string',
    },
  },
  {
    name: 'country',
    schema: {
      type: 'string',
    },
  },
  {
    name: 'currency',
    schema: {
      type: 'string',
    },
  },
] as const;

registry.registerPath({
  method: 'get',
  path: '/api/v1/sessions',
  tags: ['Sessions'],
  summary: 'List charging sessions for the authenticated user',
  security: [
    {
      bearerAuth: [] as string[],
    },
  ],
  parameters: sessionQueryParametersOpenApi.map((p) => ({
    name: p.name,
    in: 'query' as const,
    description: 'description' in p ? p.description : undefined,
    schema: p.schema,
  })),
  responses: {
    200: {
      description: 'A page of charging sessions.',
      content: {
        'application/json': {
          schema: SessionsResponse,
        },
      },
    },
    400: {
      description: 'One or more filters are invalid.',
      content: {
        'application/json': {
          schema: ReasonErrorResponse,
        },
      },
    },
    401: {
      description: 'User is unauthenticated.',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
  },
});
