export type NavigationDecision = 'allow' | 'deny' | 'external';

/**
 * Decides whether the Leaflet WebView should load a given URL.
 *
 * `about:*` must be allowed — `source={{ html }}` bootstraps the inline HTML
 * through `about:blank`, so rejecting it leaves the map stuck on a blank page
 * with no `mapReady` message ever reaching the native side. A previous audit
 * commit blocked `about:*` and silently broke the map on build 1.0.2(78).
 */
export const shouldAllowNavigation = (url: string): NavigationDecision => {
  if (url === 'about:blank' || url.startsWith('about:')) return 'allow';
  if (url.startsWith('http://') || url.startsWith('https://')) return 'allow';
  if (url.startsWith('mailto:') || url.startsWith('tel:')) return 'external';
  return 'deny';
};
