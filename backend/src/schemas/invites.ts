import { z } from 'zod';
import { ErrorResponse } from './common.js';
import { registry } from './registry.js';

export const Invite = z
  .object({
    id: z.string(),
    createdBy: z.string(),
    createdAt: z.string().datetime(),
    expiresAt: z.string().datetime().nullable(),
    usedAt: z.string().datetime().nullable(),
    usedBy: z.string().nullable(),
  })
  .openapi('Invite');

export const CreateInviteRequest = z
  .object({
    ttlDays: z.number().min(1).optional(),
  })
  .openapi('CreateInviteRequest');

export type CreateInviteRequestValue = z.infer<typeof CreateInviteRequest>;

export const CreateInviteResponse = z
  .object({
    code: z.string(),
    invite: z.object({
      id: z.string(),
      expiresAt: z.string().datetime().nullable(),
    }),
  })
  .openapi('CreateInviteResponse');

export const InvitesResponse = z
  .object({
    invites: z.array(Invite),
  })
  .openapi('InvitesResponse');

registry.register('Invite', Invite);
registry.register('CreateInviteRequest', CreateInviteRequest);
registry.register('CreateInviteResponse', CreateInviteResponse);
registry.register('InvitesResponse', InvitesResponse);

const bearerSecurity = [
  {
    bearerAuth: [] as string[],
  },
];

registry.registerPath({
  method: 'get',
  path: '/api/v1/invites',
  tags: ['Invites'],
  summary: 'List invites',
  security: bearerSecurity,
  responses: {
    200: {
      description: 'All invite rows visible to the admin.',
      content: {
        'application/json': {
          schema: InvitesResponse,
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
    403: {
      description: 'Admin role required.',
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
  path: '/api/v1/invites',
  tags: ['Invites'],
  summary: 'Create an invite',
  security: bearerSecurity,
  request: {
    body: {
      required: false,
      content: {
        'application/json': {
          schema: CreateInviteRequest,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Invite created.',
      content: {
        'application/json': {
          schema: CreateInviteResponse,
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
    403: {
      description: 'Admin role required.',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/invites/{id}',
  tags: ['Invites'],
  summary: 'Delete an invite',
  security: bearerSecurity,
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    204: {
      description: 'Invite deleted.',
    },
    401: {
      description: 'User is unauthenticated.',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
    403: {
      description: 'Admin role required.',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
    404: {
      description: 'Invite does not exist.',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
  },
});
