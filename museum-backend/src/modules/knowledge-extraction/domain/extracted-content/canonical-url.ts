/**
 * Canonical URL for dedup: strips trailing slash (except root), sorts query params.
 */
export function canonicalizeUrl(raw: string): string {
  const url = new URL(raw);

  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }

  url.searchParams.sort();

  return url.toString();
}
