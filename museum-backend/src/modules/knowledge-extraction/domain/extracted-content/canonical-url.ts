/**
 * Returns a canonical form of a URL for stable deduplication:
 * - strips trailing slash from the pathname (except root "/")
 * - sorts query parameters alphabetically for a stable fingerprint
 */
export function canonicalizeUrl(raw: string): string {
  const url = new URL(raw);

  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }

  url.searchParams.sort();

  return url.toString();
}
