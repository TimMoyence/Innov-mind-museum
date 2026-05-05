import { logger } from '@shared/logger/logger';

import { USER_AGENT } from './overpass-constants';
import { parseElement } from './overpass-tags';

import type { OverpassMuseumResult, OverpassResponse } from './overpass-types';

/** POSTs a query to a single Overpass endpoint with timeout + User-Agent. */
export async function postQuery(
  endpoint: string,
  query: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Executes the built Overpass query against a single endpoint and parses the result.
 * Returns null if the endpoint should be skipped (non-OK status or unexpected shape);
 * the caller then falls through to the next endpoint.
 *
 * @param endpoint - Overpass endpoint URL.
 * @param query - Pre-built Overpass QL query.
 * @param timeoutMs - HTTP request timeout in milliseconds.
 * @param q - Optional name-substring filter applied after parsing.
 * @returns Parsed museum results on success, or null to try next endpoint.
 */
export async function fetchFromEndpoint(
  endpoint: string,
  query: string,
  timeoutMs: number,
  q: string | undefined,
): Promise<OverpassMuseumResult[] | null> {
  const response = await postQuery(endpoint, query, timeoutMs);

  if (!response.ok) {
    logger.warn('Overpass endpoint returned non-OK status — trying next', {
      endpoint,
      status: response.status,
      statusText: response.statusText,
    });
    return null;
  }

  const data = (await response.json()) as OverpassResponse;

  if (!Array.isArray(data.elements)) {
    logger.warn('Overpass endpoint returned unexpected response shape', { endpoint });
    return null;
  }

  const results: OverpassMuseumResult[] = data.elements
    .map(parseElement)
    .filter((r): r is OverpassMuseumResult => r !== null);

  if (q) {
    const lower = q.toLowerCase();
    return results.filter((r) => r.name.toLowerCase().includes(lower));
  }

  return results;
}
