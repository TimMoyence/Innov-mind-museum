import { httpClient, mapAxiosError } from '@/shared/infrastructure/httpClient';
import { isAppError } from '@/shared/lib/errors';

type HeadersRecord = Record<string, string>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  requiresAuth?: boolean;
  headers?: HeadersRecord;
  body?: unknown;
  responseType?: 'json' | 'arraybuffer' | 'blob' | 'text';
}

const isFormData = (body: unknown): body is FormData => {
  if (typeof FormData === 'undefined') {
    return false;
  }

  return body instanceof FormData;
};

/**
 * Sends an HTTP request through the shared Axios client, mapping errors to {@link AppError}.
 * @param url - Request URL (relative paths are resolved against the runtime base URL).
 * @param options - HTTP method, headers, body, and auth requirement flag.
 * @returns Parsed response data of type `T`.
 */
export const httpRequest = async <T>(
  url: string,
  { requiresAuth = true, headers, body, method, responseType }: RequestOptions = {},
): Promise<T> => {
  const finalHeaders: HeadersRecord = {
    ...(headers ?? {}),
  };

  if (body && !isFormData(body) && finalHeaders['Content-Type'] === undefined) {
    finalHeaders['Content-Type'] = 'application/json';
  }

  try {
    const requestConfig = {
      url,
      method: method ?? 'GET',
      data: body,
      headers: finalHeaders,
      requiresAuth,
      ...(responseType ? { responseType } : {}),
    } as unknown as never;

    const response = await httpClient.request(requestConfig);

    return (response as { data: T }).data;
  } catch (error) {
    if (isAppError(error)) {
      throw error;
    }
    throw mapAxiosError(error);
  }
};
