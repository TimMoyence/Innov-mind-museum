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
 * Wikimedia User-Agent policy, follows redirects, retries transient 429/5xx).
 * NETWORK-DEPENDENT — wire it as a weekly cron + a PR check when the catalog
 * changes, NOT on every CI run (Wikimedia rate-limits).
 *
 * Usage: node artwork-image-liveness.mjs [--root <repoRoot>]
 * Exit codes: 0 → every imageUrl is 2xx · 1 → ≥1 non-2xx (or extraction failed).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const UA = 'MusaiumImageAudit/1.0 (https://musaium.com; contact@musaium.com)';
const CATALOG = 'museum-backend/src/modules/daily-art/adapters/secondary/catalog/artworks.data.ts';
const TIMEOUT_MS = 10_000;
const DELAY_MS = 300; // polite spacing between requests
const RETRY_DELAY_MS = 2_000;

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

/** HEAD a URL with one retry on transient 429/5xx. Returns the HTTP status (or 0). */
async function probe(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
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
      if ((res.status === 429 || res.status >= 500) && attempt === 0) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      return res.status;
    } catch {
      clearTimeout(t);
      if (attempt === 0) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      return 0;
    }
  }
  return 0;
}

async function main() {
  const { root } = parseArgs(process.argv);
  const urls = extractImageUrls(root);
  if (urls.length === 0) {
    process.stderr.write('## artwork-image-liveness\n\nFAIL — no imageUrl extracted from the catalog.\n');
    process.exit(1);
  }

  const broken = [];
  for (const url of urls) {
    const status = await probe(url);
    if (status < 200 || status >= 300) broken.push({ url, status });
    await sleep(DELAY_MS);
  }

  const lines = ['## artwork-image-liveness', ''];
  if (broken.length === 0) {
    lines.push(`PASS — all ${urls.length} catalog image URLs are live (2xx).`);
  } else {
    lines.push(`FAIL — ${broken.length}/${urls.length} catalog image URL(s) are not 2xx:`);
    for (const b of broken) lines.push(`- [${b.status || 'ERR'}] ${b.url}`);
  }
  process.stderr.write(lines.join('\n') + '\n');
  process.exit(broken.length === 0 ? 0 : 1);
}

main();
