#!/usr/bin/env node
/**
 * Sentinel: quota-ordering  (audit 360 dim.3 gap #rate-limit-quota)
 *
 * Guards the documented "mutating middleware ordering" gotcha (ultrareview F1,
 * 2026-05-16 bug_001): a business-quota / counter middleware that performs an
 * atomic consume (monthlySessionQuota's `SET used = used + 1`, dailyChatLimit,
 * llmCostGuard) MUST run AFTER the Zod `validateBody` short-circuit. Otherwise a
 * malformed request (Zod 400) still inflates the user's quota counter before the
 * 400 is returned — silent quota theft / inflation.
 *
 * Rule (precise, zero-false-positive):
 *   For each `router.<verb>(path, ...middlewares)` call, IF the middleware list
 *   contains BOTH a `validateBody(...)` AND a mutating quota middleware, THEN the
 *   `validateBody` must appear BEFORE the quota middleware. A call with a quota
 *   middleware but NO `validateBody` is NOT flagged — that is the documented
 *   multipart exemption (chat-media/compare/message validate manually inside the
 *   handler because Multer parses the body, see those route headers).
 *
 * IP/user rate limiters (`createRateLimitMiddleware` instances) are intentionally
 * NOT guarded: rate-limiting invalid floods BEFORE validation is desirable; the
 * gotcha is specifically about business-quota consumption.
 *
 * Pure-Node text scan (paren-balanced extraction of each router call). No AST dep.
 * Exit 0 = ordering holds. Exit 1 = a quota middleware precedes its validator.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = join(__dirname, '..', '..');
const MODULES_DIR = join(BACKEND_ROOT, 'src', 'modules');

// Business-quota / counter middlewares that perform an atomic consume.
const MUTATING_QUOTA = ['monthlySessionQuota', 'dailyChatLimit', 'llmCostGuard'];
const MUTATING_QUOTA_RE = /\b(monthlySessionQuota|dailyChatLimit|llmCostGuard|consumeQuota|enforceQuota)\b/;
const VALIDATOR_RE = /\bvalidateBody\s*\(/;

function walk(dir, predicate) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, predicate));
    else if (predicate(entry.name)) out.push(full);
  }
  return out;
}

/** Extract each `router.<verb>(...)` call body (paren-balanced) from source. */
function extractRouterCalls(src) {
  const calls = [];
  const re = /\brouter\.(get|post|put|patch|delete)\s*\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const verb = m[1];
    let depth = 0;
    let i = re.lastIndex - 1; // at the opening '('
    const start = i;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '(') depth++;
      else if (c === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    calls.push({ verb, body: src.slice(start, i + 1) });
  }
  return calls;
}

function main() {
  const routeFiles = walk(MODULES_DIR, (n) => n.endsWith('.route.ts'));
  const violations = [];
  let guardedCalls = 0;

  for (const file of routeFiles) {
    const src = readFileSync(file, 'utf8');
    for (const call of extractRouterCalls(src)) {
      const hasValidator = VALIDATOR_RE.test(call.body);
      const quota = MUTATING_QUOTA.find((q) => new RegExp(`\\b${q}\\b`).test(call.body))
        ?? (MUTATING_QUOTA_RE.test(call.body) ? call.body.match(MUTATING_QUOTA_RE)[1] : null);
      if (!quota) continue;
      if (!hasValidator) continue; // multipart exemption — no validateBody to order against
      guardedCalls += 1;
      const vIdx = call.body.search(VALIDATOR_RE);
      const qIdx = call.body.search(new RegExp(`\\b${quota}\\b`));
      if (qIdx < vIdx) {
        const pathLit = (call.body.match(/['"`]([^'"`]+)['"`]/) ?? [, '<unknown>'])[1];
        violations.push({
          file: relative(BACKEND_ROOT, file),
          verb: call.verb.toUpperCase(),
          path: pathLit,
          quota,
        });
      }
    }
  }

  console.log(`[quota-ordering] scanned ${String(routeFiles.length)} route file(s), ${String(guardedCalls)} call(s) with both a validator and a quota middleware`);

  if (violations.length) {
    console.error('\n[quota-ordering] ✗ quota/counter middleware runs BEFORE its Zod validator (counter inflation on invalid requests):');
    for (const v of violations) {
      console.error(`  • ${v.file} — ${v.verb} ${v.path}: \`${v.quota}\` precedes \`validateBody(...)\``);
    }
    console.error('\n  Fix: move validateBody(<schema>) ABOVE the quota middleware in the router call so a Zod 400 short-circuits BEFORE the atomic consume (ultrareview F1 / bug_001 / CLAUDE.md § "Mutating middleware ordering").');
    process.exit(1);
  }

  console.log('[quota-ordering] ✓ every guarded call validates before consuming quota');
  process.exit(0);
}

main();
