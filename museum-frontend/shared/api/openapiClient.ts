import { httpRequest } from '@/services/http';
import type { paths } from '@/shared/api/generated/openapi';

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';
type PathKey = keyof paths & string;
type HeadersRecord = Record<string, string>;
type QueryPrimitive = string | number | boolean | null | undefined;

type AvailableMethodsForPath<P extends PathKey> = {
  [M in HttpMethod]: paths[P][M] extends undefined ? never : M;
}[HttpMethod];

type OperationFor<
  P extends PathKey,
  M extends AvailableMethodsForPath<P>,
> = NonNullable<paths[P][M]>;

type ResponsesFor<
  P extends PathKey,
  M extends AvailableMethodsForPath<P>,
> = OperationFor<P, M> extends { responses: infer R } ? R : never;

type ResponseForStatus<
  P extends PathKey,
  M extends AvailableMethodsForPath<P>,
  S extends number,
> = S extends keyof ResponsesFor<P, M> ? ResponsesFor<P, M>[S] : never;

type JsonContent<T> = T extends {
  content: { 'application/json': infer Json };
}
  ? Json
  : void;

type SuccessStatusFor<
  P extends PathKey,
  M extends AvailableMethodsForPath<P>,
> = 200 extends keyof ResponsesFor<P, M>
  ? 200
  : 201 extends keyof ResponsesFor<P, M>
    ? 201
    : 202 extends keyof ResponsesFor<P, M>
      ? 202
      : 204 extends keyof ResponsesFor<P, M>
        ? 204
        : never;

export type OpenApiResponseFor<
  P extends PathKey,
  M extends AvailableMethodsForPath<P>,
  S extends number = SuccessStatusFor<P, M>,
> = JsonContent<ResponseForStatus<P, M, S>>;

export type OpenApiJsonRequestBodyFor<
  P extends PathKey,
  M extends AvailableMethodsForPath<P>,
> = OperationFor<P, M> extends {
  requestBody?: {
    content: { 'application/json': infer Body };
  };
}
  ? Body
  : never;

type PathParamNames<T extends string> = T extends `${string}{${infer Param}}${infer Rest}`
  ? Param | PathParamNames<Rest>
  : never;

export type PathParamsFor<P extends PathKey> = [PathParamNames<P>] extends [never]
  ? Record<string, never>
  : Record<PathParamNames<P>, string | number>;

const appendQuery = (path: string, query?: Record<string, QueryPrimitive>): string => {
  if (!query) return path;

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    search.set(key, String(value));
  }

  const suffix = search.toString();
  return suffix ? `${path}?${suffix}` : path;
};

export const formatOpenApiPath = <P extends PathKey>(
  template: P,
  pathParams?: PathParamsFor<P>,
): string => {
  const params = (pathParams || {}) as Record<string, string | number>;
  const rendered = template.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const value = params[key];
    if (value === undefined || value === null) {
      throw new Error(`Missing path param: ${key}`);
    }
    return encodeURIComponent(String(value));
  });

  if (/\{[^}]+\}/.test(rendered)) {
    throw new Error(`Unresolved path params in template: ${template}`);
  }

  return rendered;
};

export const openApiRequest = async <
  P extends PathKey,
  M extends AvailableMethodsForPath<P>,
  S extends number = SuccessStatusFor<P, M>,
>(params: {
  path: P;
  method: M;
  pathParams?: PathParamsFor<P>;
  query?: Record<string, QueryPrimitive>;
  body?: unknown;
  headers?: HeadersRecord;
  requiresAuth?: boolean;
}): Promise<OpenApiResponseFor<P, M, S>> => {
  const url = appendQuery(formatOpenApiPath(params.path, params.pathParams), params.query);

  return httpRequest<OpenApiResponseFor<P, M, S>>(url, {
    method: params.method.toUpperCase() as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    body: params.body,
    headers: params.headers,
    requiresAuth: params.requiresAuth,
  });
};

