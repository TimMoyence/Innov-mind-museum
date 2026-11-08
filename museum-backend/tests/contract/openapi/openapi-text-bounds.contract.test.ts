import { z } from 'zod';

import { resolveReportSchema } from '@modules/admin/adapters/primary/http/schemas/admin.schemas';
import {
  changeEmailSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '@modules/auth/adapters/primary/http/schemas/auth.schemas';
import {
  submitB2bLeadSchema,
  submitBetaSignupSchema,
  submitPaywallInterestSchema,
} from '@modules/leads/adapters/primary/http/schemas/leads.schemas';
import {
  createMuseumSchema,
  updateMuseumSchema,
} from '@modules/museum/adapters/primary/http/schemas/museum.schemas';
import { createReviewSchema } from '@modules/review/adapters/primary/http/schemas/review.schemas';
import {
  addTicketMessageSchema,
  createTicketSchema,
  submitSupportContactSchema,
} from '@modules/support/adapters/primary/http/schemas/support.schemas';

import spec from '../../../openapi/openapi.json';

interface Bounds {
  minLength?: number;
  maxLength?: number;
}

interface JsonSchemaNode extends Bounds {
  type?: string | string[];
  anyOf?: JsonSchemaNode[];
  properties?: Record<string, JsonSchemaNode>;
  $ref?: string;
}

const ROUTES: { method: 'post' | 'put' | 'patch'; path: string; schema: z.ZodType }[] = [
  { method: 'post', path: '/api/auth/register', schema: registerSchema },
  { method: 'post', path: '/api/auth/login', schema: loginSchema },
  { method: 'post', path: '/api/auth/forgot-password', schema: forgotPasswordSchema },
  { method: 'put', path: '/api/auth/change-email', schema: changeEmailSchema },
  { method: 'put', path: '/api/auth/change-password', schema: changePasswordSchema },
  { method: 'post', path: '/api/auth/reset-password', schema: resetPasswordSchema },
  { method: 'post', path: '/api/museums', schema: createMuseumSchema },
  { method: 'put', path: '/api/museums/{id}', schema: updateMuseumSchema },
  { method: 'post', path: '/api/leads/b2b', schema: submitB2bLeadSchema },
  { method: 'post', path: '/api/leads/beta', schema: submitBetaSignupSchema },
  { method: 'post', path: '/api/leads/paywall-interest', schema: submitPaywallInterestSchema },
  { method: 'post', path: '/api/support/contact', schema: submitSupportContactSchema },
  { method: 'post', path: '/api/support/tickets', schema: createTicketSchema },
  { method: 'post', path: '/api/support/tickets/{id}/messages', schema: addTicketMessageSchema },
  { method: 'post', path: '/api/reviews', schema: createReviewSchema },
  { method: 'patch', path: '/api/admin/reports/{id}', schema: resolveReportSchema },
];

function stringBranch(node: JsonSchemaNode | undefined): JsonSchemaNode | undefined {
  if (!node) return undefined;
  if (node.anyOf) return node.anyOf.find((branch) => branch.type === 'string');
  const types = Array.isArray(node.type) ? node.type : [node.type];
  return types.includes('string') ? node : undefined;
}

function boundsOf(node: JsonSchemaNode | undefined): Bounds {
  return { minLength: node?.minLength, maxLength: node?.maxLength };
}

function contractBody(method: string, path: string): JsonSchemaNode {
  const paths = spec.paths as Record<string, Record<string, unknown>>;
  const operation = paths[path]?.[method] as
    | { requestBody?: { content?: { 'application/json'?: { schema?: JsonSchemaNode } } } }
    | undefined;
  const schema = operation?.requestBody?.content?.['application/json']?.schema;
  if (!schema) throw new Error(`corps absent du contrat : ${method.toUpperCase()} ${path}`);
  if (!schema.$ref) return schema;
  const name = schema.$ref.split('/').pop() ?? '';
  return (spec.components.schemas as Record<string, JsonSchemaNode>)[name];
}

describe('L3 · le contrat OpenAPI porte les mêmes bornes de texte que le serveur', () => {
  for (const route of ROUTES) {
    it(`${route.method.toUpperCase()} ${route.path}`, () => {
      const zodBody = z.toJSONSchema(route.schema, {
        io: 'input',
        unrepresentable: 'any',
      }) as JsonSchemaNode;
      const contract = contractBody(route.method, route.path);

      const fields = Object.keys(zodBody.properties ?? {}).filter(
        (field) => stringBranch(zodBody.properties?.[field]) !== undefined,
      );

      expect(fields.length).toBeGreaterThan(0);
      const server = Object.fromEntries(
        fields.map((field) => [field, boundsOf(stringBranch(zodBody.properties?.[field]))]),
      );
      const declared = Object.fromEntries(
        fields.map((field) => [field, boundsOf(stringBranch(contract.properties?.[field]))]),
      );
      expect(declared).toEqual(server);
    });
  }
});
