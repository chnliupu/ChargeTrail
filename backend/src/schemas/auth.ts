import { z } from 'zod';
import { ErrorResponse } from './common.js';
import { registry } from './registry.js';

const requiredString = (field: string) =>
  z
    .string({
      message: `${field} is required`,
    })
    .refine((v) => v.trim().length > 0, {
      message: `${field} is required`,
    });

export const RegisterRequest = z
  .object({
    invite: requiredString('invite'),
    email: requiredString('email'),
    username: requiredString('username'),
    password: requiredString('password'),
    name: z
      .string()
      .optional()
      .transform((v) => (v && v.trim().length > 0 ? v : undefined)),
  })
  .openapi('RegisterRequest', {
    description: 'Invite-gated registration payload.',
  });

export type RegisterRequestValue = z.infer<typeof RegisterRequest>;

export const RegisterResponse = z
  .object({
    token: z.string().optional(),
    user: z
      .object({
        id: z.string().optional(),
        email: z.string().optional(),
        name: z.string().optional(),
        username: z.string().optional(),
      })
      .optional(),
  })
  .openapi('RegisterResponse');

export const SetupAdminRequest = z
  .object({
    email: requiredString('email'),
    username: requiredString('username'),
    password: requiredString('password'),
    name: z
      .string()
      .optional()
      .transform((v) => (v && v.trim().length > 0 ? v : undefined)),
  })
  .openapi('SetupAdminRequest', {
    description: 'First-admin bootstrap payload (only valid while no admin exists).',
  });

export type SetupAdminRequestValue = z.infer<typeof SetupAdminRequest>;

export const SetupStatusResponse = z
  .object({
    noAdmin: z.literal(true),
  })
  .openapi('SetupStatusResponse', {
    description: 'Returned only while the instance has no admin user.',
  });

registry.register('RegisterRequest', RegisterRequest);
registry.register('RegisterResponse', RegisterResponse);
registry.register('SetupAdminRequest', SetupAdminRequest);
registry.register('SetupStatusResponse', SetupStatusResponse);

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/register',
  tags: ['Auth'],
  summary: 'Register a user with an invite code',
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: RegisterRequest,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Registration succeeded.',
      content: {
        'application/json': {
          schema: RegisterResponse,
        },
      },
    },
    400: {
      description: 'Invite code or required fields are invalid.',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
    500: {
      description: 'Registration failed before Better Auth returned a response.',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/setup/status',
  tags: ['Auth'],
  summary: 'Check whether the instance still needs a first admin',
  responses: {
    200: {
      description: 'No admin exists yet; first-run setup is available.',
      content: {
        'application/json': {
          schema: SetupStatusResponse,
        },
      },
    },
    404: {
      description: 'An admin already exists; the setup surface is closed.',
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/setup/admin',
  tags: ['Auth'],
  summary: 'Create the first admin user (only while no admin exists)',
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: SetupAdminRequest,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'First admin created and signed in.',
      content: {
        'application/json': {
          schema: RegisterResponse,
        },
      },
    },
    400: {
      description: 'Required fields are invalid.',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
    404: {
      description: 'An admin already exists; the setup surface is closed.',
    },
    500: {
      description: 'Setup failed before Better Auth returned a response.',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
  },
});
