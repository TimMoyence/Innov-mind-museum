import fs from 'node:fs';
import path from 'node:path';

import swaggerUi from 'swagger-ui-express';

import type { Express } from 'express';

const loadOpenApiSpec = (): Record<string, unknown> => {
  const specPath = path.resolve(process.cwd(), 'openapi', 'openapi.json');
  // eslint-disable-next-line n/no-sync -- spec is read once at boot during setupSwagger(); event loop is not yet serving requests
  const raw = fs.readFileSync(specPath, 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
};

export const setupSwagger = (app: Express): void => {
  // TD-SW-01 — disable the online validator badge (cross-origin call to
  // online.swagger.io leaks the spec) + persist Authorize across reloads +
  // brand the page title (lib-docs/swagger-ui-express/PATTERNS.md).
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(loadOpenApiSpec(), {
      customSiteTitle: 'Musaium API',
      swaggerOptions: { validatorUrl: null, persistAuthorization: true },
    }),
  );
};
