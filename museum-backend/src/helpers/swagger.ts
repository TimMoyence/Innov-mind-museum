import fs from 'fs';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

const loadOpenApiSpec = (): Record<string, unknown> => {
  const specPath = path.resolve(process.cwd(), 'openapi', 'openapi.json');
  const raw = fs.readFileSync(specPath, 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
};

export const setupSwagger = (app: Express): void => {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(loadOpenApiSpec()));
};
