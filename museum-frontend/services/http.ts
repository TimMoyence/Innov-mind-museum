import { getAccessToken } from './tokenStore';

type HeadersRecord = Record<string, string>;

interface RequestOptions extends RequestInit {
  requiresAuth?: boolean;
}

const isFormData = (body: unknown): body is FormData => {
  if (typeof FormData === 'undefined') {
    return false;
  }

  return body instanceof FormData;
};

export const httpRequest = async <T>(
  url: string,
  { requiresAuth = true, headers, body, ...rest }: RequestOptions = {},
): Promise<T> => {
  const finalHeaders: HeadersRecord = {
    Accept: 'application/json',
    ...(headers as HeadersRecord | undefined),
  };

  if (requiresAuth) {
    const token = getAccessToken();
    if (token) {
      finalHeaders.Authorization = `Bearer ${token}`;
    }
  }

  if (body && !isFormData(body) && finalHeaders['Content-Type'] === undefined) {
    finalHeaders['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...rest,
    headers: finalHeaders,
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `${response.status} ${response.statusText}`.trim() +
        (errorText ? `: ${errorText}` : ''),
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const responseText = await response.text();

  if (!responseText.length) {
    return undefined as T;
  }

  try {
    return JSON.parse(responseText) as T;
  } catch (_error) {
    return responseText as unknown as T;
  }
};
