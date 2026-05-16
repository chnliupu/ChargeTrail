import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { registry } from '../../schemas/registry.js';

// Importing each schema module registers its components and paths as a side
// effect on the shared registry.
import '../../schemas/common.js';
import '../../schemas/health.js';
import '../../schemas/auth.js';
import '../../schemas/connectors.js';
import '../../schemas/sessions.js';
import '../../schemas/invites.js';
import '../../schemas/admin.js';

const generator = new OpenApiGeneratorV3(registry.definitions);

export const openApiDocument = generator.generateDocument({
  openapi: '3.0.3',
  info: {
    title: 'ChargeTrail API',
    version: 'v1',
    description:
      "REST API for ChargeTrail. This document is generated from the Zod schemas that also drive request validation; it covers the app-owned /api/v1 endpoints and excludes Better Auth's generated /api/auth endpoints.",
  },
  servers: [
    {
      url: '/',
    },
  ],
  tags: [
    {
      name: 'Health',
    },
    {
      name: 'Auth',
    },
    {
      name: 'Connectors',
    },
    {
      name: 'Sessions',
    },
    {
      name: 'Invites',
    },
    {
      name: 'Admin',
    },
  ],
});
