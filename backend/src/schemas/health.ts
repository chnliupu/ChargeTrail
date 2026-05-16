import { HealthResponse } from './common.js';
import { registry } from './registry.js';

registry.registerPath({
  method: 'get',
  path: '/api/v1/health',
  tags: ['Health'],
  summary: 'Health check',
  responses: {
    200: {
      description: 'Backend is healthy.',
      content: {
        'application/json': {
          schema: HealthResponse,
        },
      },
    },
  },
});
