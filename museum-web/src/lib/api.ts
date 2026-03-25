/** Lightweight API client for both server and client components. */

class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function getBaseUrl(): string {
  // Server-side: use the full backend URL
  if (typeof window === 'undefined') {
    return process.env.API_BASE_URL ?? 'http://localhost:3000';
  }
  // Client-side: use Next.js rewrites (/api → backend)
  return '';
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<T> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const errorBody = (await res.json()) as { message?: string };
      if (errorBody.message) {
        message = errorBody.message;
      }
    } catch {
      // ignore parse errors — keep statusText
    }
    throw new ApiError(res.status, res.statusText, message);
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export function apiGet<T>(path: string, token?: string): Promise<T> {
  return request<T>('GET', path, undefined, token);
}

export function apiPost<T>(path: string, body?: unknown, token?: string): Promise<T> {
  return request<T>('POST', path, body, token);
}

export function apiPatch<T>(path: string, body?: unknown, token?: string): Promise<T> {
  return request<T>('PATCH', path, body, token);
}

export { ApiError };
