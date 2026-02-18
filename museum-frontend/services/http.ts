import { httpClient, mapAxiosError } from '@/shared/infrastructure/httpClient';
import { isAppError } from '@/shared/lib/errors';

type HeadersRecord = Record<string, string>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  requiresAuth?: boolean;
  headers?: HeadersRecord;
  body?: unknown;
}

const isFormData = (body: unknown): body is FormData => {
  if (typeof FormData === 'undefined') {
    return false;
  }

  return body instanceof FormData;
};

export const httpRequest = async <T>(
  url: string,
  { requiresAuth = true, headers, body, method }: RequestOptions = {},
): Promise<T> => {
  const finalHeaders: HeadersRecord = {
    ...(headers || {}),
  };

  if (body && !isFormData(body) && finalHeaders['Content-Type'] === undefined) {
    finalHeaders['Content-Type'] = 'application/json';
  }

  try {
    const requestConfig = {
      url,
      method: method || 'GET',
      data: body,
      headers: finalHeaders,
      requiresAuth,
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
