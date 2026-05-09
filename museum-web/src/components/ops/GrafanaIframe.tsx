'use client';

/**
 * Sandboxed iframe wrapper around the self-hosted Grafana panel served by
 * the nginx reverse proxy at `/grafana/*` (same-origin — see
 * `infra/nginx/conf.d/grafana.conf`).
 *
 * Threat model + access guarantee documented in
 * `docs/OPS_DEPLOYMENT.md` §Grafana iframe limitation. The route this
 * component is rendered from MUST be wrapped in a super-admin role guard
 * — the iframe content exposes ops data across all tenants.
 *
 * Sandbox attributes:
 *   - allow-scripts        : Grafana is a SPA, scripts are required.
 *   - allow-same-origin    : required for the Grafana session cookie.
 *   - (no allow-forms)     : we don't want a malicious dashboard JSON to
 *                            POST credentials anywhere from the iframe.
 *   - (no allow-popups)    : same reason, prevents window.open exfil.
 *   - (no allow-top-navigation) : prevents a `target=_top` link inside
 *                                  Grafana from navigating away from the
 *                                  museum-web admin shell.
 */

interface GrafanaIframeProps {
  /** Dashboard UID at `/grafana/d/<uid>`. */
  readonly dashboardUid: string;
  /** Optional starting time-range query string, e.g. `from=now-1h&to=now`. */
  readonly query?: string;
  /** Accessible label surfaced to screen readers. */
  readonly title: string;
  /**
   * Iframe height. Number = px. String = any valid CSS length.
   * Default `'70vh'` keeps the panel comfortable on a 1080p screen.
   */
  readonly height?: number | string;
}

export default function GrafanaIframe({
  dashboardUid,
  query = '',
  title,
  height = '70vh',
}: GrafanaIframeProps) {
  const search = query ? `&${query}` : '';
  // `kiosk` strips Grafana chrome (sidebar / topbar) — pure panel content.
  const src = `/grafana/d/${encodeURIComponent(dashboardUid)}?kiosk${search}`;
  return (
    <iframe
      src={src}
      title={title}
      sandbox="allow-scripts allow-same-origin"
      loading="lazy"
      referrerPolicy="same-origin"
      style={{
        width: '100%',
        height: typeof height === 'number' ? `${height}px` : height,
        border: 0,
      }}
    />
  );
}
