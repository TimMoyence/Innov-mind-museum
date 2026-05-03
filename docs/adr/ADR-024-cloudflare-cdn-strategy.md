# ADR-024 — Cloudflare CDN for static assets + landing/admin

**Status:** Accepted (design — Cloudflare account provisioning deferred to ops)
**Date:** 2026-05-01
**Deciders:** staff DB/SRE pass — subsystem F
**Spec:** see git log (deleted 2026-05-03 — original in commit history)

## Context

Current architecture: backend serves static admin SPA + landing HTML
directly. At single-replica scale this is fine; at 100K rps, ~80% of
total traffic is GETs for hashed static bundles, OpenAPI JSON, landing
HTML — all CDN-cacheable.

Without a CDN, every request hits the backend → wasted CPU on serving
static bytes that never change.

## Decision

Front the public surface with **Cloudflare** (free tier sufficient for
~100M monthly requests; Pro tier for analytics + WAF). Cloudflare proxies
to the existing backend origin. Cache rules:

- **Hashed static bundles** (admin JS/CSS with content hash in filename):
  `Cache-Control: public, max-age=31536000, immutable`. Edge cache for 1
  year. Origin is hit only on cold cache.
- **Admin index.html** (changes per deploy): `Cache-Control: public,
  max-age=0, must-revalidate, s-maxage=60`. Edge revalidates every 60s.
- **OpenAPI JSON** (changes per backend deploy): `Cache-Control: public,
  max-age=300, s-maxage=3600`. 5min browser, 1h edge.
- **Landing pages**: `Cache-Control: public, max-age=300, s-maxage=86400`.
  5min browser, 24h edge (purge on landing redeploy via Cloudflare API).
- **/api/** paths: `Cache-Control: no-store` (default; never cache API).

Backend codebase ships a `httpCacheHeaders` helper that emits the right
header set per asset class. Wired on the OpenAPI endpoint and the admin
static middleware in F Phase 2.

## Consequences

- Origin requests/sec drop ≥ 80% at sustained scale (industry-standard
  cacheable-asset ratio).
- Cache invalidation on deploy: backend issues a Cloudflare cache-purge
  API call as part of the existing `_deploy-backend.yml` workflow (added
  in F Phase 2 if not already present).
- DDoS protection + TLS termination free with Cloudflare.
- Cost: $0 (free tier) up to ~100M req/mo; $20/mo Pro for analytics + WAF.

## Alternatives considered

- **AWS CloudFront**: rejected — costlier, more setup, no benefit over
  Cloudflare at this scale.
- **No CDN, scale backend horizontally**: rejected — wastes 5-10×
  backend cost on serving cacheable bytes.
- **Self-hosted Varnish**: rejected — operationally heavier than
  Cloudflare for marginal control gain.
