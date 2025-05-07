import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

const swaggerOptions: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Museum-IA API',
      version: '1.0.0',
      description: 'Documentation for the Museum-IA backend API',
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['src/**/*.route.ts'],
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);

export const setupSwagger = (app: Express): void => {
  app.use('/api/v1/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
};
