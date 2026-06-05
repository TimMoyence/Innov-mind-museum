#!/usr/bin/env node
// @ts-check
/**
 * artwork-image-liveness sentinel (CONTENT-01/02/04).
 *
 * The daily-art catalog hotlinks artwork images from Wikimedia. Those URLs rot:
 * Wikimedia restricts thumbnail widths (a non-whitelisted width → HTTP 400) and
 * files get renamed/removed (→ 404). The 2026-05 audit found 14/30 broken (incl.
 * the Mona Lisa). `daily-art.test.ts` only checks the `https://` format, never
 * liveness — this sentinel closes that gap.
 *
 * Extracts every `imageUrl` from artworks.data.ts and issues a HEAD (UA per the
 * Wikimedia User-Agent policy, follows redirects, retries transient 429/5xx with
 * exponential backoff honouring Retry-After).
 * NETWORK-DEPENDENT — wire it as a weekly cron + a PR check when the catalog
 * changes, NOT on every CI run (Wikimedia rate-limits).
 *
 * A 429 surviving every retry is treated as INCONCLUSIVE (throttle, not death):
 * Wikimedia rate-limits datacenter/runner IPs before resolving the resource, so a
 * persistent 429 says nothing about whether the image exists. It is reported as a
 * warning but does NOT fail the run — only genuinely dead URLs (4xx≠429 / 5xx /
 * network error) fail it, preserving the sentinel's purpose (catch 404/400 rot).
 *
 * Usage: node artwork-image-liveness.mjs [--root <repoRoot>]
 * Exit codes: 0 → every imageUrl is 2xx (or only throttled) · 1 → ≥1 dead URL.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const UA = 'MusaiumImageAudit/1.0 (https://musaium.com; contact@musaium.com)';
const CATALOG = 'museum-backend/src/modules/daily-art/adapters/secondary/catalog/artworks.data.ts';
const TIMEOUT_MS = 10_000;
const DELAY_MS = 300; // polite spacing between requests
// Backoff schedule between retries (ms). Length+1 = max attempts. Grows to ride
// out Wikimedia's datacenter-IP rate-limit window (a single 2s retry was not
// enough on hosted runners — observed persistent 429 on PR #310).
const BACKOFFS_MS = [2_000, 5_000, 12_000];
const MAX_RETRY_WAIT_MS = 30_000; // cap when honouring a large Retry-After

function parseArgs(argv) {
  const args = argv.slice(2);
  let root = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root' && args[i + 1]) {
      root = args[i + 1];
      i++;
    }
  }
  return { root: root ?? resolve(__dirname, '../../..') };
}

function extractImageUrls(root) {
  const text = readFileSync(join(root, CATALOG), 'utf8');
  const urls = [];
  for (const m of text.matchAll(/imageUrl:\s*'([^']+)'/g)) urls.push(m[1]);
  return urls;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * HEAD a URL, retrying transient 429/5xx with exponential backoff (honouring a
 * Retry-After header when present). Returns the last observed HTTP status (or 0
 * on network error/timeout after all attempts).
 */
async function probe(url) {
  const maxAttempts = BACKOFFS_MS.length + 1;
  let lastStatus = 0;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        headers: { 'User-Agent': UA },
        signal: ctrl.signal,
      });
      clearTimeout(t);
      lastStatus = res.status;
      const transient = res.status === 429 || res.status >= 500;
      if (transient && attempt < maxAttempts - 1) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const wait =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1_000, MAX_RETRY_WAIT_MS)
            : BACKOFFS_MS[attempt];
        await sleep(wait);
        continue;
      }
      return res.status;
    } catch {
      clearTimeout(t);
      lastStatus = 0;
      if (attempt < maxAttempts - 1) {
        await sleep(BACKOFFS_MS[attempt]);
        continue;
      }
      return 0;
    }
  }
  return lastStatus;
}

async function main() {
  const { root } = parseArgs(process.argv);
  const urls = extractImageUrls(root);
  if (urls.length === 0) {
    process.stderr.write(
      '## artwork-image-liveness\n\nFAIL — no imageUrl extracted from the catalog.\n',
    );
    process.exit(1);
  }

  // dead = genuinely non-live (404/400 rot, 5xx, network error) → fails the run.
  // throttled = 429 surviving every retry → inconclusive (Wikimedia rate-limits
  // the runner IP before resolving the resource) → reported but does NOT fail.
  const dead = [];
  const throttled = [];
  for (const url of urls) {
    const status = await probe(url);
    if (status >= 200 && status < 300) {
      // live
    } else if (status === 429) {
      throttled.push({ url, status });
    } else {
      dead.push({ url, status });
    }
    await sleep(DELAY_MS);
  }

  const lines = ['## artwork-image-liveness', ''];
  if (dead.length === 0) {
    const live = urls.length - throttled.length;
    lines.push(`PASS — ${live}/${urls.length} catalog image URLs are live (2xx).`);
    if (throttled.length > 0) {
      lines.push('');
      lines.push(
        `WARN — ${throttled.length} URL(s) returned 429 after all retries (Wikimedia rate-limit, not death; unverified):`,
      );
      for (const t of throttled) lines.push(`- [429] ${t.url}`);
    }
  } else {
    lines.push(
      `FAIL — ${dead.length}/${urls.length} catalog image URL(s) are dead (non-2xx, non-429):`,
    );
    for (const d of dead) lines.push(`- [${d.status || 'ERR'}] ${d.url}`);
    if (throttled.length > 0) {
      lines.push('');
      lines.push(`(plus ${throttled.length} unverified 429 throttle(s) — not counted as dead)`);
    }
  }
  process.stderr.write(lines.join('\n') + '\n');
  process.exit(dead.length === 0 ? 0 : 1);
}

main();
