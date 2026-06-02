#!/usr/bin/env node
/**
 * Sentinel: request-decompression-invariants  (Wave 1, Cluster F — W1-GZIP)
 *
 * The request-body decompression middleware (`requestDecompressionMiddleware`)
 * is a PROD-SAFE capability: it inflates gzip/deflate/br request bodies BEFORE
 * express.json parses them, with a streaming zip-bomb cap. It is NOT the W2
 * fault injector — it must NEVER refuse to run in production. This sentinel
 * asserts the structural invariants a future refactor could silently break:
 *
 *   1. CORS allowedHeaders include 'Content-Encoding' — dropping it strips the
 *      header at the preflight, so the FE's gzipped request bodies are rejected
 *      by the browser before they ever reach the server.
 *   2. The middleware is mounted in app.ts STRICTLY BEFORE express.json( — if it
 *      ran after the body parser, express.json would see raw gzip bytes and 400.
 *   3. The middleware module is PROD-SAFE: no `NODE_ENV === 'production'` /
 *      `isProd` refusal guard that would disable decompression in prod.
 *
 * Pure-Node structural string checks on src/app.ts +
 * src/shared/middleware/request-decompression.middleware.ts (no AST/YAML dep;
 * mirrors security-headers-invariants.mjs). Exit 0 = invariants hold.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = join(__dirname, '..', '..');
const APP_TS = join(BACKEND_ROOT, 'src', 'app.ts');
const MW_TS = join(
  BACKEND_ROOT,
  'src',
  'shared',
  'middleware',
  'request-decompression.middleware.ts',
);

const failures = [];
const check = (label, cond, hint) => {
  if (!cond) failures.push({ label, hint });
};

if (!existsSync(APP_TS)) {
  console.error('[request-decompression-invariants] ✗ src/app.ts not found');
  process.exit(1);
}
if (!existsSync(MW_TS)) {
  console.error(
    '[request-decompression-invariants] ✗ request-decompression.middleware.ts not found',
  );
  process.exit(1);
}
const app = readFileSync(APP_TS, 'utf8');
const mw = readFileSync(MW_TS, 'utf8');

// 1. CORS allowedHeaders include 'Content-Encoding'.
const corsMatch = app.match(/allowedHeaders:\s*\[([\s\S]*?)\]/);
const corsBody = corsMatch ? corsMatch[1] : '';
check(
  "CORS allowedHeaders include 'Content-Encoding'",
  /['"]Content-Encoding['"]/.test(corsBody),
  "add 'Content-Encoding' to the CORS allowedHeaders array — dropping it makes the browser strip the FE's gzip request header at the preflight",
);

// 2. Decompression mounted BEFORE express.json( (and after compression()).
const compressionIdx = app.indexOf('compression(');
const decompressionIdx = app.indexOf('requestDecompressionMiddleware');
const jsonIdx = app.indexOf('express.json(');
check(
  'requestDecompressionMiddleware is mounted in app.ts',
  decompressionIdx >= 0,
  'mount requestDecompressionMiddleware in applyGlobalMiddleware',
);
check(
  'decompression mounted AFTER compression()',
  compressionIdx >= 0 && decompressionIdx >= 0 && compressionIdx < decompressionIdx,
  'mount the decompression middleware after compression() / setTimeout',
);
check(
  'decompression mounted STRICTLY BEFORE express.json(',
  decompressionIdx >= 0 && jsonIdx >= 0 && decompressionIdx < jsonIdx,
  'mount the decompression middleware before express.json so the parser reads inflated bytes',
);

// 3. Middleware module is PROD-SAFE (no production-refusal guard).
check(
  "middleware has NO NODE_ENV === 'production' refusal guard",
  !/NODE_ENV\s*===\s*['"]production['"]/.test(mw),
  'the decompression middleware must run in prod — remove any NODE_ENV production branch that disables it',
);
check(
  'middleware has NO isProd refusal guard',
  !/isProd/.test(mw),
  'the decompression middleware must run in prod — remove any isProd branch that disables it',
);

if (failures.length === 0) {
  console.log(
    '[request-decompression-invariants] ✓ CORS Content-Encoding + mount-before-express.json + prod-safe invariants hold',
  );
  process.exit(0);
}

console.error(
  `[request-decompression-invariants] ✗ ${String(failures.length)} invariant(s) regressed:`,
);
for (const f of failures) {
  console.error(`  • ${f.label}`);
  if (f.hint) console.error(`      fix: ${f.hint}`);
}
process.exit(1);
