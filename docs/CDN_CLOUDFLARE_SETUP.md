# CloudFlare CDN Setup — Musaium

Guide for configuring CloudFlare as a reverse proxy / CDN in front of the Musaium backend.

## 1. DNS Migration

1. Add `musaium.com` to CloudFlare (free plan is sufficient)
2. Verify imported A record points to the VPS IP (orange-cloud proxied)
3. Add CNAME `www.musaium.com` → `musaium.com` (proxied)
4. Repeat for `musaium.fr`
5. Update nameservers at the registrar to CloudFlare's assigned NS pair
6. Wait for propagation (typically < 5 minutes, up to 48h)

## 2. SSL/TLS

| Setting | Value |
|---------|-------|
| SSL mode | **Full (Strict)** |
| Always Use HTTPS | On |
| Minimum TLS Version | 1.2 |
| TLS 1.3 | On |
| Automatic HTTPS Rewrites | On |

Optional: generate a CloudFlare Origin Certificate (15 years) to replace Let's Encrypt on the origin server.

## 3. Caching

The backend is a **dynamic, authenticated API** — almost nothing is cacheable at the CDN.

**Cache Rules** (preferred over deprecated Page Rules):

| Rule | Match | Action |
|------|-------|--------|
| Health endpoint | URI path = `/api/health` | Cache, Edge TTL 10s |
| Image endpoint | URI path matches `/api/chat/messages/*/image` | Cache, Edge TTL 60s |
| Default | All other `/api/*` | Bypass cache |

**Browser Cache TTL**: "Respect Existing Headers" (the backend sets `Cache-Control` per endpoint).

## 4. Security

| Setting | Value |
|---------|-------|
| Bot Fight Mode | On |
| Security Level | Medium |
| Browser Integrity Check | On |

**WAF rate-limit rule**: `/api/auth/*` → 20 requests / 10 seconds per IP → Block 60s

## 5. Network

| Setting | Value |
|---------|-------|
| HTTP/2 | On |
| HTTP/3 (QUIC) | On |
| Response Buffering | **Off** (critical for SSE streaming) |
| WebSockets | On |

## 6. Nginx Changes (already applied)

The `musaium.conf` Nginx config includes `set_real_ip_from` for all CloudFlare IP ranges and `real_ip_header CF-Connecting-IP`, ensuring `$remote_addr` reflects the real client IP for rate limiting and logging.

## 7. Backend Changes (already applied)

- Default `Cache-Control: no-store` middleware on all responses
- `/api/health` overrides with `public, max-age=10, s-maxage=10`
- `trust proxy` stays at `1` (Nginx resolves the real IP via CF-Connecting-IP)

## 8. CI/CD (Optional)

Post-deploy cache purge (add to `deploy-backend.yml`):

```yaml
- name: Purge CloudFlare cache
  if: success()
  run: |
    curl -s -X POST \
      "https://api.cloudflare.com/client/v4/zones/${{ secrets.CLOUDFLARE_ZONE_ID }}/purge_cache" \
      -H "Authorization: Bearer ${{ secrets.CLOUDFLARE_API_TOKEN }}" \
      -H "Content-Type: application/json" \
      --data '{"files":["https://musaium.com/api/health"]}'
```

Requires GitHub secrets: `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_API_TOKEN` (scoped to cache purge only).

## 9. Rollback

To disable CloudFlare: switch DNS records from orange-cloud (proxied) to gray-cloud (DNS-only) in the CloudFlare dashboard. Traffic will go directly to the origin.

## 10. Verification Checklist

- [ ] DNS resolves through CloudFlare (`dig musaium.com` shows CF IPs)
- [ ] SSL handshake works (Full Strict)
- [ ] `/api/health` returns `200` through CF
- [ ] SSE streaming (`/api/chat/sessions/:id/messages/stream`) works without buffering
- [ ] Rate limiting sees real client IPs (check backend logs for `req.ip`)
- [ ] Auth flows work (login, register, social login)
- [ ] Image serving works (`/api/chat/messages/:id/image`)
