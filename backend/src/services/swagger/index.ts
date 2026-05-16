import type { Express, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { openApiDocument } from './openapi.js';

const SWAGGER_DOCS_PATH = '/api-docs';

export function isSwaggerEnabled(): boolean {
  return (process.env.SWAGGER_ENABLED ?? '').trim().toLowerCase() === 'true';
}

export function mountSwagger(app: Express): void {
  if (!isSwaggerEnabled()) {
    return;
  }

  app.get(`${SWAGGER_DOCS_PATH}/swagger.json`, (_req: Request, res: Response) => {
    res.json(openApiDocument);
  });

  app.use(
    SWAGGER_DOCS_PATH,
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      explorer: true,
    }),
  );
}
