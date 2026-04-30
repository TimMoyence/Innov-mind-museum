# ADR-006 — SSRF defense-in-depth for html-scraper

- **Status**: Accepted — Implemented (proposed 2026-04-21, shipped before 2026-04-30)
- **Owner**: Backend — knowledge-extraction module
- **Supersedes**: None (tightens the baseline validated by `2026-04-20_security-full-audit.md`)

> **Implementation note (2026-04-30):** the manual-redirect loop, `BLOCKED_HOSTNAMES` set, and `validateHostname` helper are live in `museum-backend/src/modules/knowledge-extraction/adapters/secondary/html-scraper.ts` (see `BLOCKED_HOSTNAMES` line 31, `validateHostname` line 146, `fetchWithSafeRedirects` line 189). The 6 targeted unit tests called out in "Follow-ups" landed in `tests/unit/knowledge-extraction/html-scraper.test.ts`.

## Context

`museum-backend/src/modules/knowledge-extraction/adapters/secondary/html-scraper.ts:85-136` performs a single pre-fetch DNS validation (`isPrivateIp(lookup(hostname).address)`) then calls `fetch(url, { redirect: 'follow' })`.

The OWASP SSRF Prevention Cheat Sheet (WebSearch 2026-04-21) confirms this pattern is **vulnerable to two attack classes**:

1. **Redirect SSRF** — an attacker-controlled public URL returns `302 Location: http://169.254.169.254/latest/meta-data/iam/security-credentials/`. Node's native `fetch` with `redirect: 'follow'` re-resolves DNS internally **without our `validateUrl` running a second time**. The cloud metadata endpoint is reached. Pattern applies to AWS/GCP/Azure/DigitalOcean/OpenStack IMDS at well-known addresses.
2. **DNS rebinding** — a hostname that initially resolves to a public IP returns a TTL-zero redirect to the *same host*, which re-resolves to an internal IP on the next lookup. Mitigated by DNS-pinning or per-hop IP classification.

The `knowledge-extraction` worker reaches the scraper through `chat-message.service.ts:260 → enqueueForExtraction → BullMQ → ExtractionJobService → scraper.scrape(url)`. The URL set comes from Tavily / Google CSE / DuckDuckGo / Brave / SearXNG search results — an attacker who seeds a site that appears in those indices can weaponise the scraper even though the URL is not directly user-supplied.

Current exposure classified as **HIGH** by the audit (not critical because the scraper is internal-admin-facing via queue, not public API, but defence-in-depth is policy).

## Decision

Replace the single-shot validation + `redirect: 'follow'` pattern with a **manual redirect loop** that re-runs policy at every hop:

1. **`validateHostname(hostname)`** (private helper) — returns `{ ok: true, address }` or `{ ok: false, reason }`. Reasons: `blocked_hostname`, `private_ip`, `dns_resolution_failed`.
2. **`BLOCKED_HOSTNAMES`** set — `metadata.google.internal`, `metadata.goog`, `metadata.azure.com`, `metadata.packet.net`, `instance-data`. Short-circuits before DNS for policy rejection signalling.
3. **Expanded `isPrivateIp`** — normalises IPv4-mapped IPv6 (`::ffff:192.168.0.1` → `192.168.0.1`) before classification. Existing coverage of `127.`, `10.`, `169.254.`, `172.16-31.`, `192.168.`, `fc`, `fd`, `fe80`, `::1`, `0.` is preserved.
4. **`fetchWithSafeRedirects(url, init)`** — issues `fetch(currentUrl, { ...init, redirect: 'manual' })` in a loop bounded by `MAX_REDIRECTS = 5`. On `3xx` with `Location`:
   - Resolve relative Location against `currentUrl`.
   - Reject if protocol is not `http:`/`https:`.
   - Run `validateHostname` on the new hostname.
   - Drain the redirect body (`arrayBuffer()`) to release the keep-alive connection.
   - Continue with the next hop.
5. **Final URL propagated** — `extractContent(finalUrl, html)` uses the final URL (post-redirects) as the canonical reference. Eliminates a second-order cache/logging bug where we would label scraped content by its original URL.
6. **Error shape** — `{ blocked: true, reason, hop }` returned from the helper and logged as `scraper_ssrf_blocked` with the hop index. Preserves the existing `fail-open` semantic at the `scrape()` level (returns `null`, does not throw to callers).

## Rejected alternatives

- **`redirect: 'error'` only** — rejected: loses all legitimate redirects (trailing-slash canonicalisation, HTTP→HTTPS, `www.` upgrades). Too strict for real-world public web.
- **Direct IP pinning (bypass DNS on each hop, use first-resolved IP as Host header)** — rejected: breaks TLS SNI; breaks virtual-host Apache/nginx sharing IPs. Significant feature loss for marginal gain over per-hop DNS re-check.
- **`redirect: 'follow'` + proxy that filters responses** — rejected: introduces a new critical dependency; corporate proxies add latency; proxy itself becomes an attack surface.
- **Delete the scraper entirely** — rejected: knowledge-extraction dbLookup already consumes the scraped data (`chat-message.service.ts:260` → `llm-prompt-builder.ts:299-301` injects `localKnowledgeBlock` into the LLM prompt with priority over Wikidata). Module is wired and used.

## Consequences

### Positive
- Closes redirect SSRF across AWS/GCP/Azure/DO/Packet metadata endpoints.
- Closes partial DNS-rebinding (per-hop re-validation catches late rebinds; fully closed only with IP-pinning which was rejected for TLS reasons).
- Explicit `hop` logging makes forensic analysis trivial if an attack attempt is detected.
- Preserves existing fail-open at caller (no breakage of chat pipeline when a URL is rejected).

### Negative
- Adds one extra DNS lookup per redirect hop. Scraper performance impact: p99 +~20 ms per redirect. Acceptable for the knowledge-extraction queue (BullMQ async, not chat-path critical).
- New code paths to cover — 6 targeted unit tests added in `tests/unit/knowledge-extraction/html-scraper.test.ts` covering the manual redirect loop.
- Response body draining on redirects adds one `arrayBuffer()` call per hop. Best-effort, wrapped in try/catch.

## Residual risk

- **Short-lived TTL DNS rebinding** (attacker controls authoritative server with TTL 0, rotates IP between hops) can still race the per-hop lookup. Mitigation: Node's DNS cache (no cache by default for `lookup`) means each hop re-queries; full closure requires IP pinning + TLS SNI rewrite, rejected above.
- **IPv6 special-use blocks beyond fc00::/7, fe80::/10** not yet covered (e.g., `::` unspecified, `2001::/32` Teredo, `2002::/16` 6to4). Extend `isPrivateIp` if the scraper surfaces a finding.

## Follow-ups

- Open [Bloc A1] ticket — implementation + 6 new tests.
- Add `scraper_ssrf_blocked` to Sentry alert policy so a sudden spike is paged.
- Re-validate after 30 days via Semgrep CI + a live PoC against a test 302 → 169.254.169.254 endpoint.
