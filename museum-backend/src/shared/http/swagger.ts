import { readFile } from 'node:fs/promises';
import path from 'node:path';

import swaggerUi from 'swagger-ui-express';

import type { Express, NextFunction, Request, Response } from 'express';

const loadOpenApiSpec = async (): Promise<Record<string, unknown>> => {
  const raw = await readFile(path.resolve(process.cwd(), 'openapi', 'openapi.json'), 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
};

export const setupSwagger = (app: Express): void => {
  const docs = loadOpenApiSpec().then((spec) =>
    swaggerUi.setup(spec, {
      customSiteTitle: 'Musaium API',
      swaggerOptions: { validatorUrl: null, persistAuthorization: true },
    }),
  );
  app.use('/api/docs', swaggerUi.serve, (req: Request, res: Response, next: NextFunction) => {
    docs.then(
      (handler) => {
        handler(req, res, next);
      },
      (error: unknown) => {
        next(error);
      },
    );
  });
};
