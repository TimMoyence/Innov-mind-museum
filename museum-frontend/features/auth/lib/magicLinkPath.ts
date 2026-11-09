const MAGIC_LINK_ROUTES = new Set(['verify-email', 'reset-password', 'confirm-email-change']);

const LOCALE_PREFIXES = new Set(['fr', 'en']);

export const mapMagicLinkPath = (input: string): string => {
  const queryIndex = input.indexOf('?');
  const beforeQuery = queryIndex === -1 ? input : input.slice(0, queryIndex);
  const query = queryIndex === -1 ? '' : input.slice(queryIndex);

  const schemeMatch = /^[a-z][a-z0-9+.-]*:\/\//i.exec(beforeQuery);
  let pathOnly = beforeQuery;
  if (schemeMatch) {
    const afterScheme = beforeQuery.slice(schemeMatch[0].length);
    const firstSlash = afterScheme.indexOf('/');
    if (firstSlash === -1) return input;
    pathOnly = afterScheme.slice(firstSlash);
  }

  const segments = pathOnly.split('/').filter((segment) => segment.length > 0);
  if (segments.length === 0) return input;

  const firstSegment = segments[0];
  const routeSegments =
    firstSegment !== undefined && LOCALE_PREFIXES.has(firstSegment) ? segments.slice(1) : segments;

  const route = routeSegments[0];
  if (routeSegments.length !== 1 || route === undefined || !MAGIC_LINK_ROUTES.has(route)) {
    return input;
  }

  return `/${route}${query}`;
};
