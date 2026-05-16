import { z } from 'zod';
import { ChargePointToken, ErrorResponse, ReasonErrorResponse } from './common.js';
import { isBrowserSessionToken } from '../services/providers/browser-token.js';
import { registry } from './registry.js';

export const SUPPORTED_PROVIDERS = ['chargepoint', 'swtch', 'flo'] as const;
export type SupportedChargeProvider = (typeof SUPPORTED_PROVIDERS)[number];

/**
 * Runtime membership check for `SUPPORTED_PROVIDERS`. The tuple itself must
 * stay an array to satisfy `z.enum(...)`, so this Set is a sibling export
 * for code paths that just need a fast `.has()` check. The custom `has`
 * type predicate also narrows `string` to `SupportedChargeProvider`,
 * eliminating the long `row.provider !== 'chargepoint' && ...` guards in
 * route handlers.
 */
export const SUPPORTED_PROVIDERS_SET: ReadonlySet<SupportedChargeProvider> & {
  has(value: string): value is SupportedChargeProvider;
} = new Set<string>(SUPPORTED_PROVIDERS) as unknown as ReadonlySet<SupportedChargeProvider> & {
  has(value: string): value is SupportedChargeProvider;
};

const ProviderField = z
  .preprocess(
    (v) => (typeof v === 'string' ? v.trim() : v),
    z.enum(SUPPORTED_PROVIDERS, {
      message: 'provider is required',
    }),
  )
  .openapi({
    type: 'string',
    enum: [...SUPPORTED_PROVIDERS],
    example: 'swtch',
  });

const ProviderUsernameField = z
  .string({
    message: 'providerUsername is required',
  })
  .refine((v) => v.trim().length > 0, {
    message: 'providerUsername is required',
  })
  .transform((v) => v.trim());

const OptionalNullableString = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (typeof v === 'string' ? v.trim() : null));

const OptionalToken = z
  .any()
  .check((ctx) => {
    const value = ctx.value;
    if (value == null) {
      return;
    }
    if (!isBrowserSessionToken(value)) {
      ctx.issues.push({
        code: 'custom',
        message: 'token must include non-empty Cookie and User-Agent fields',
        input: value,
        path: [],
      });
    }
  })
  .transform((value: unknown) => {
    if (!isBrowserSessionToken(value)) {
      return null;
    }
    return {
      Cookie: value.Cookie.trim(),
      'User-Agent': value['User-Agent'].trim(),
    };
  })
  .openapi({
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
  });

const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export const ConnectorAddRequest = z
  .object({
    provider: ProviderField,
    providerUsername: ProviderUsernameField,
    providerPassword: OptionalNullableString.optional(),
    token: OptionalToken.optional(),
  })
  .openapi('ConnectorAddRequest', {
    description: 'Payload to register a new connector for the authenticated user.',
  });

export type ConnectorAddRequestValue = z.infer<typeof ConnectorAddRequest>;

export const ConnectorResponse = z
  .object({
    id: z.uuid(),
    provider: z.enum(SUPPORTED_PROVIDERS),
    providerUsername: z.string(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    lastSyncedAt: z.iso.datetime().nullable(),
  })
  .openapi('ConnectorResponse');

// Auth body has tri-state semantics: missing/empty body means "use stored
// token", but as soon as one of Cookie / User-Agent is present we must
// receive a valid pair.
export const ConnectorAuthBody = z
  .any()
  .check((ctx) => {
    const value = ctx.value;
    if (value == null || typeof value !== 'object') {
      return;
    }
    const hasCookie = 'Cookie' in value;
    const hasUserAgent = 'User-Agent' in value;
    if (!hasCookie && !hasUserAgent) {
      return;
    }
    if (!isBrowserSessionToken(value)) {
      ctx.issues.push({
        code: 'custom',
        message: 'request token must include non-empty Cookie and User-Agent fields',
        input: value,
        path: [],
      });
    }
  })
  .transform((value: unknown) => {
    if (value == null || typeof value !== 'object') {
      return null;
    }
    if (!isBrowserSessionToken(value)) {
      return null;
    }
    return {
      Cookie: value.Cookie.trim(),
      'User-Agent': value['User-Agent'].trim(),
    };
  });

export type ConnectorAuthBodyValue = z.infer<typeof ConnectorAuthBody>;

export const ConnectorAuthResponse = z
  .object({
    ok: z.boolean(),
    cached: z.boolean(),
  })
  .openapi('ConnectorAuthResponse', {
    example: {
      ok: true,
      cached: true,
    },
  });

const LaterThanField = z
  .string({
    message: 'later_than must be an ISO-8601 timestamp string',
  })
  .refine((v) => ISO_TIMESTAMP_PATTERN.test(v.trim()) && Number.isFinite(Date.parse(v.trim())), {
    message: 'later_than must be a valid ISO-8601 timestamp string',
  })
  .transform((v) => Date.parse(v.trim()))
  .openapi({
    type: 'string',
    format: 'date-time',
  });

export const ConnectorSyncRequest = z
  .object({
    later_than: LaterThanField.optional(),
  })
  .openapi('ConnectorSyncRequest', {
    description: 'Optional bound on which historical sessions to sync.',
  });

export type ConnectorSyncRequestValue = z.infer<typeof ConnectorSyncRequest>;

export const ConnectorSyncResponse = z
  .object({
    ok: z.boolean(),
    lastSyncedAt: z.iso.datetime().nullable(),
    imported: z.number().int().min(0).optional(),
    updated: z.number().int().min(0).optional(),
    skipped: z.number().int().min(0).optional(),
    nextLaterThan: z.iso.datetime().nullable().optional(),
    pagesFetched: z.number().int().min(1).optional(),
    sessionsFetched: z.number().int().min(0).optional(),
    sessionsInserted: z.number().int().min(0).optional(),
    stoppedReason: z
      .enum(['last-page', 'all-existing', 'empty-page', 'older-than-boundary', 'max-pages-reached'])
      .nullable()
      .optional(),
  })
  .openapi('ConnectorSyncResponse');

// PATCH schemas. Provider is intentionally NOT patchable: changing it would
// invalidate stored credentials and break the user/provider/username unique
// key. All fields are optional; absent = leave untouched.
const PatchUsernameField = z
  .string()
  .refine((v) => v.trim().length > 0, {
    message: 'providerUsername must not be empty',
  })
  .transform((v) => v.trim())
  .optional();

const PatchPasswordField = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (typeof v === 'string' ? v.trim() : v));

export const ConnectorPatchRequest = z
  .object({
    providerUsername: PatchUsernameField,
    providerPassword: PatchPasswordField,
    token: OptionalToken.optional(),
  })
  .openapi('ConnectorPatchRequest', {
    description:
      'Partial update of a connector. Only fields present in the body are modified. Provider is immutable.',
  });

export type ConnectorPatchRequestValue = z.infer<typeof ConnectorPatchRequest>;

export const ConnectorListItem = ConnectorResponse.extend({
  sessionCount: z.number().int().min(0).optional(),
}).openapi('ConnectorListItem');

export const ConnectorListResponse = z
  .object({
    connectors: z.array(ConnectorListItem),
  })
  .openapi('ConnectorListResponse');

export const ConnectorListQuery = z
  .object({
    withSessionCount: z
      .union([z.literal('true'), z.literal('false'), z.boolean()])
      .optional()
      .transform((v) => v === true || v === 'true'),
  })
  .openapi('ConnectorListQuery');

export type ConnectorListQueryValue = z.infer<typeof ConnectorListQuery>;

export const ConnectorDeleteQuery = z
  .object({
    removeSessions: z
      .union([z.literal('true'), z.literal('false'), z.boolean()])
      .optional()
      .transform((v) => v === true || v === 'true'),
  })
  .openapi('ConnectorDeleteQuery');

export type ConnectorDeleteQueryValue = z.infer<typeof ConnectorDeleteQuery>;

export const ConnectorDeleteResponse = z
  .object({
    ok: z.boolean(),
    removedSessions: z.number().int().min(0),
    nullifiedSessions: z.number().int().min(0),
  })
  .openapi('ConnectorDeleteResponse');

registry.register('ConnectorAddRequest', ConnectorAddRequest);
registry.register('ConnectorResponse', ConnectorResponse);
registry.register('ConnectorAuthResponse', ConnectorAuthResponse);
registry.register('ConnectorSyncRequest', ConnectorSyncRequest);
registry.register('ConnectorSyncResponse', ConnectorSyncResponse);
registry.register('ConnectorPatchRequest', ConnectorPatchRequest);
registry.register('ConnectorListItem', ConnectorListItem);
registry.register('ConnectorListResponse', ConnectorListResponse);
registry.register('ConnectorListQuery', ConnectorListQuery);
registry.register('ConnectorDeleteResponse', ConnectorDeleteResponse);

const bearerSecurity = [
  {
    bearerAuth: [] as string[],
  },
];

registry.registerPath({
  method: 'post',
  path: '/api/v1/connector/add',
  tags: ['Connectors'],
  summary: 'Add a connector for the authenticated user',
  security: bearerSecurity,
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: ConnectorAddRequest,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Connector created.',
      content: {
        'application/json': {
          schema: z.object({
            connector: ConnectorResponse,
          }),
        },
      },
    },
    400: {
      description: 'Connector request body is invalid.',
      content: {
        'application/json': {
          schema: ErrorResponse,
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
    409: {
      description: 'Connector already exists for this user/provider/username.',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/connector/{id}/auth',
  tags: ['Connectors'],
  summary: 'Validate and optionally cache a provider browser session token',
  security: bearerSecurity,
  request: {
    params: z.object({
      id: z.string(),
    }),
    body: {
      required: false,
      content: {
        'application/json': {
          schema: ChargePointToken,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Token is valid.',
      content: {
        'application/json': {
          schema: ConnectorAuthResponse,
        },
      },
    },
    400: {
      description: 'Connector, token, or request body is invalid.',
      content: {
        'application/json': {
          schema: ReasonErrorResponse,
        },
      },
    },
    401: {
      description: 'User is unauthenticated or token is rejected by the provider.',
      content: {
        'application/json': {
          schema: ReasonErrorResponse,
        },
      },
    },
    404: {
      description: 'Connector does not exist.',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
    502: {
      description: 'Provider validation request failed.',
      content: {
        'application/json': {
          schema: ReasonErrorResponse,
        },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/connector/{id}/sync',
  tags: ['Connectors'],
  summary: 'Sync charging sessions for a connector',
  security: bearerSecurity,
  request: {
    params: z.object({
      id: z.string(),
    }),
    body: {
      required: false,
      content: {
        'application/json': {
          schema: ConnectorSyncRequest,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Sync completed.',
      content: {
        'application/json': {
          schema: ConnectorSyncResponse,
        },
      },
    },
    400: {
      description: 'Sync request or connector token is invalid.',
      content: {
        'application/json': {
          schema: ReasonErrorResponse,
        },
      },
    },
    401: {
      description: 'User is unauthenticated or provider token is invalid.',
      content: {
        'application/json': {
          schema: ReasonErrorResponse,
        },
      },
    },
    404: {
      description: 'Connector does not exist.',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
    502: {
      description: 'Provider returned an invalid response or the sync request failed.',
      content: {
        'application/json': {
          schema: ReasonErrorResponse,
        },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/connector',
  tags: ['Connectors'],
  summary: 'List connectors for the authenticated user',
  security: bearerSecurity,
  request: {
    query: ConnectorListQuery,
  },
  responses: {
    200: {
      description:
        'List of connectors for the authenticated user. Per-connector session counts are included only when withSessionCount=true.',
      content: {
        'application/json': {
          schema: ConnectorListResponse,
        },
      },
    },
    401: {
      description: 'User is unauthenticated.',
      content: {
        'application/json': { schema: ErrorResponse },
      },
    },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/connector/{id}',
  tags: ['Connectors'],
  summary: 'Update a connector (provider is immutable)',
  security: bearerSecurity,
  request: {
    params: z.object({ id: z.string() }),
    body: {
      required: true,
      content: {
        'application/json': { schema: ConnectorPatchRequest },
      },
    },
  },
  responses: {
    200: {
      description: 'Connector updated.',
      content: {
        'application/json': {
          schema: z.object({ connector: ConnectorResponse }),
        },
      },
    },
    400: {
      description: 'Patch request is invalid.',
      content: { 'application/json': { schema: ErrorResponse } },
    },
    401: {
      description: 'User is unauthenticated.',
      content: { 'application/json': { schema: ErrorResponse } },
    },
    404: {
      description: 'Connector does not exist.',
      content: { 'application/json': { schema: ErrorResponse } },
    },
    409: {
      description: 'Updated providerUsername conflicts with another connector.',
      content: { 'application/json': { schema: ErrorResponse } },
    },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/connector/{id}',
  tags: ['Connectors'],
  summary: 'Delete a connector',
  security: bearerSecurity,
  request: {
    params: z.object({ id: z.string() }),
    query: ConnectorDeleteQuery,
  },
  responses: {
    200: {
      description:
        'Connector deleted. If removeSessions=true, imported sessions were deleted too; otherwise their connectorId is set to null.',
      content: {
        'application/json': { schema: ConnectorDeleteResponse },
      },
    },
    401: {
      description: 'User is unauthenticated.',
      content: { 'application/json': { schema: ErrorResponse } },
    },
    404: {
      description: 'Connector does not exist.',
      content: { 'application/json': { schema: ErrorResponse } },
    },
  },
});
