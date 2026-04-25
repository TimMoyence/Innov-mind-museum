import openApiSpec from '../../../openapi/openapi.json';

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type OpenApiSchema = {
  $ref?: string;
  oneOf?: OpenApiSchema[];
  anyOf?: OpenApiSchema[];
  allOf?: OpenApiSchema[];
  type?: string | string[];
  enum?: unknown[];
  format?: string;
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  items?: OpenApiSchema;
  additionalProperties?: boolean | OpenApiSchema;
} & Record<string, unknown>;

type OpenApiSpec = typeof openApiSpec;

const spec = openApiSpec as OpenApiSpec;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const isValidUuid = (value: string): boolean => {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
};

const isValidDateTime = (value: string): boolean => {
  return !Number.isNaN(Date.parse(value));
};

const isValidEmail = (value: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

const getSchemaByRef = (ref: string): OpenApiSchema => {
  if (!ref.startsWith('#/')) {
    throw new Error(`Unsupported external $ref: ${ref}`);
  }

  const parts = ref.slice(2).split('/');
  let current: unknown = spec;
  for (const part of parts) {
    if (!isRecord(current) || !(part in current)) {
      throw new Error(`Unable to resolve OpenAPI $ref: ${ref}`);
    }
    current = current[part];
  }

  if (!isRecord(current)) {
    throw new Error(`Resolved $ref is not an object schema: ${ref}`);
  }

  return current as OpenApiSchema;
};

const validateAgainstSchema = (
  schemaInput: OpenApiSchema,
  value: unknown,
  path: string,
): string[] => {
  const schema = schemaInput.$ref ? getSchemaByRef(schemaInput.$ref) : schemaInput;

  if (schema.oneOf?.length) {
    const branches = schema.oneOf.map((branch) => validateAgainstSchema(branch, value, path));
    if (branches.some((errors) => errors.length === 0)) {
      return [];
    }
    return [
      `${path}: value does not match any oneOf schema (${branches.flat().slice(0, 3).join('; ')})`,
    ];
  }

  if (schema.anyOf?.length) {
    const branches = schema.anyOf.map((branch) => validateAgainstSchema(branch, value, path));
    if (branches.some((errors) => errors.length === 0)) {
      return [];
    }
    return [`${path}: value does not match any anyOf schema`];
  }

  if (schema.allOf?.length) {
    return schema.allOf.flatMap((branch) => validateAgainstSchema(branch, value, path));
  }

  if (schema.enum) {
    const matches = schema.enum.some((candidate) => Object.is(candidate, value));
    if (!matches) {
      return [
        `${path}: expected one of ${JSON.stringify(schema.enum)} but got ${JSON.stringify(value)}`,
      ];
    }
  }

  const declaredTypes = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];

  if (declaredTypes.length > 1) {
    const unionResults = declaredTypes.map((typeName) =>
      validateAgainstSchema({ ...schema, type: typeName }, value, path),
    );
    if (unionResults.some((errors) => errors.length === 0)) {
      return [];
    }
    return unionResults[0] || [`${path}: does not match declared types`];
  }

  const inferredType =
    declaredTypes[0] || (schema.properties || schema.additionalProperties ? 'object' : undefined);

  if (inferredType === 'null') {
    return value === null ? [] : [`${path}: expected null`];
  }

  if (inferredType === 'string') {
    if (typeof value !== 'string') {
      return [`${path}: expected string`];
    }
    if (schema.format === 'uuid' && !isValidUuid(value)) {
      return [`${path}: expected uuid format`];
    }
    if (schema.format === 'date-time' && !isValidDateTime(value)) {
      return [`${path}: expected date-time format`];
    }
    if (schema.format === 'email' && !isValidEmail(value)) {
      return [`${path}: expected email format`];
    }
    return [];
  }

  if (inferredType === 'boolean') {
    return typeof value === 'boolean' ? [] : [`${path}: expected boolean`];
  }

  if (inferredType === 'integer') {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      return [`${path}: expected integer`];
    }
    return [];
  }

  if (inferredType === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return [`${path}: expected number`];
    }
    return [];
  }

  if (inferredType === 'array') {
    if (!Array.isArray(value)) {
      return [`${path}: expected array`];
    }
    if (!schema.items) {
      return [];
    }
    return value.flatMap((item, index) =>
      validateAgainstSchema(schema.items as OpenApiSchema, item, `${path}[${index}]`),
    );
  }

  if (inferredType === 'object') {
    if (!isRecord(value)) {
      return [`${path}: expected object`];
    }

    const errors: string[] = [];
    const required = schema.required || [];
    for (const key of required) {
      if (!(key in value)) {
        errors.push(`${path}.${key}: missing required property`);
      }
    }

    const properties = schema.properties || {};
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (!(key in value)) {
        continue;
      }
      errors.push(
        ...validateAgainstSchema(propertySchema as OpenApiSchema, value[key], `${path}.${key}`),
      );
    }

    const additional = schema.additionalProperties;
    if (additional === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) {
          errors.push(`${path}.${key}: additional property not allowed`);
        }
      }
    } else if (isRecord(additional)) {
      for (const [key, v] of Object.entries(value)) {
        if (key in properties) {
          continue;
        }
        errors.push(...validateAgainstSchema(additional as OpenApiSchema, v, `${path}.${key}`));
      }
    }

    return errors;
  }

  return [];
};

const getResponseSchema = (
  path: string,
  method: HttpMethod,
  statusCode: number,
): OpenApiSchema | null => {
  const pathItem = (spec.paths as Record<string, unknown>)[path];
  if (!isRecord(pathItem)) {
    throw new Error(`OpenAPI path not found: ${path}`);
  }
  const operation = pathItem[method];
  if (!isRecord(operation)) {
    throw new Error(`OpenAPI method not found: ${method.toUpperCase()} ${path}`);
  }
  const responses = operation.responses;
  if (!isRecord(responses)) {
    throw new Error(`OpenAPI responses missing for ${method.toUpperCase()} ${path}`);
  }
  let response: Record<string, unknown> = (responses[String(statusCode)] ??
    responses[statusCode]) as Record<string, unknown>;
  if (!isRecord(response)) {
    throw new Error(
      `OpenAPI response status ${statusCode} not found for ${method.toUpperCase()} ${path}`,
    );
  }
  if (typeof response.$ref === 'string') {
    response = getSchemaByRef(response.$ref) as Record<string, unknown>;
  }
  const content = response.content;
  if (!isRecord(content)) {
    return null;
  }
  const json = content['application/json'];
  if (!isRecord(json)) {
    return null;
  }
  const schema = json.schema;
  if (!isRecord(schema)) {
    return null;
  }
  return schema as OpenApiSchema;
};

/**
 * Test utility: asserts that a response payload structurally matches the OpenAPI spec for the given endpoint.
 * @param params - Endpoint path, HTTP method, status code, and the response payload to validate.
 * @throws Error if the payload does not conform to the declared schema.
 */
export const assertMatchesOpenApiResponse = (params: {
  path: string;
  method: HttpMethod;
  statusCode: number;
  payload: unknown;
}): void => {
  const schema = getResponseSchema(params.path, params.method, params.statusCode);
  if (!schema) {
    if (params.payload === undefined) {
      return;
    }
    throw new Error(
      `No application/json schema for ${params.method.toUpperCase()} ${params.path} ${params.statusCode}, but payload was provided`,
    );
  }

  const errors = validateAgainstSchema(schema, params.payload as JsonValue, '$');
  if (errors.length) {
    throw new Error(
      [
        `OpenAPI response validation failed for ${params.method.toUpperCase()} ${params.path} ${params.statusCode}`,
        ...errors.slice(0, 20),
      ].join('\n'),
    );
  }
};

/**
 * Resolves the `application/json` request-body schema declared in OpenAPI
 * for a given operation, or `null` when no body is declared.
 */
const getRequestBodySchema = (path: string, method: HttpMethod): OpenApiSchema | null => {
  const pathItem = (spec.paths as Record<string, unknown>)[path];
  if (!isRecord(pathItem)) {
    throw new Error(`OpenAPI path not found: ${path}`);
  }
  const operation = pathItem[method];
  if (!isRecord(operation)) {
    throw new Error(`OpenAPI method not found: ${method.toUpperCase()} ${path}`);
  }
  let requestBody: Record<string, unknown> | null = isRecord(operation.requestBody)
    ? operation.requestBody
    : null;
  if (!requestBody) {
    return null;
  }
  if (typeof requestBody.$ref === 'string') {
    const resolved = getSchemaByRef(requestBody.$ref);
    requestBody = isRecord(resolved) ? (resolved as Record<string, unknown>) : null;
    if (!requestBody) return null;
  }
  const content = requestBody.content;
  if (!isRecord(content)) {
    return null;
  }
  const json = content['application/json'];
  if (!isRecord(json)) {
    return null;
  }
  const schema = json.schema;
  if (!isRecord(schema)) {
    return null;
  }
  return schema as OpenApiSchema;
};

/**
 * Test utility: asserts that a request body structurally matches the OpenAPI
 * spec for the given operation.
 *
 * Use this in contract tests to catch drift between what routes validate
 * (Zod schemas) and what the OpenAPI spec declares (source-of-truth for
 * external consumers + generated mobile types).
 */
export const assertMatchesOpenApiRequest = (params: {
  path: string;
  method: HttpMethod;
  body: unknown;
}): void => {
  const schema = getRequestBodySchema(params.path, params.method);
  if (!schema) {
    if (params.body === undefined) {
      return;
    }
    throw new Error(
      `No application/json request body schema for ${params.method.toUpperCase()} ${params.path}, but body was provided`,
    );
  }

  const errors = validateAgainstSchema(schema, params.body as JsonValue, '$');
  if (errors.length) {
    throw new Error(
      [
        `OpenAPI request validation failed for ${params.method.toUpperCase()} ${params.path}`,
        ...errors.slice(0, 20),
      ].join('\n'),
    );
  }
};
