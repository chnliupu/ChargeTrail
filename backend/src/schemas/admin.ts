import { z } from 'zod';
import { ErrorResponse } from './common.js';
import { registry } from './registry.js';

export const SetPasswordRequest = z
  .object({
    newPassword: z
      .string({
        message: 'newPassword is required',
      })
      .min(1, {
        message: 'newPassword is required',
      }),
  })
  .openapi('SetPasswordRequest');

export type SetPasswordRequestValue = z.infer<typeof SetPasswordRequest>;

registry.register('SetPasswordRequest', SetPasswordRequest);

const bearerSecurity = [
  {
    bearerAuth: [] as string[],
  },
];

registry.registerPath({
  method: 'post',
  path: '/api/v1/admin/users/{id}/password',
  tags: ['Admin'],
  summary: "Set a user's password",
  security: bearerSecurity,
  request: {
    params: z.object({
      id: z.string(),
    }),
    body: {
      required: true,
      content: {
        'application/json': {
          schema: SetPasswordRequest,
        },
      },
    },
  },
  responses: {
    204: {
      description: 'Password updated.',
    },
    400: {
      description: 'newPassword is missing.',
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
    403: {
      description: 'Admin role required.',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
    500: {
      description: 'Password could not be set.',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
  },
});
