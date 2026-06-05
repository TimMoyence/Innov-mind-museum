#!/usr/bin/env node
/**
 * Sentinel: security-headers-invariants  (audit 360 dim.3 gap #csp)
 *
 * Helmet is configured per-env in src/app.ts: dev/test deliberately turn CSP +
 * HSTS off (so http://localhost + inline tooling work); production locks them
 * down. "dev↔prod parity" is therefore the WRONG framing — they are meant to
 * differ. What must NOT regress are the PRODUCTION hardening invariants. This
 * sentinel asserts the prod branch of `buildHelmetOptions` + the CORS config
 * still hold the security guarantees a future refactor could silently weaken:
 *
 *   1. HSTS maxAge >= 2y, includeSubDomains:true, preload:true (preload-list eligible)
 *   2. CSP enabled in prod (a `contentSecurityPolicy: { directives ... }` object)
 *   3. scriptSrc has NO 'unsafe-inline' (XSS surface)
 *   4. frameAncestors 'none' + objectSrc 'none' (clickjacking / plugin surface)
 *   5. CORS allowedHeaders include 'sentry-trace' + 'baggage' — dropping these
 *      strips distributed tracing at the preflight, breaking FE↔BE correlation
 *      SILENTLY (CLAUDE.md gotcha — sentry-trace/baggage in allowedHeaders).
 *
 * Pure-Node structural string checks on src/app.ts (no YAML/AST dep, mirrors the
 * sentry-scrubber-parity / compose-parity style). Exit 0 = invariants hold.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = join(__dirname, '..', '..');
const APP_TS = join(BACKEND_ROOT, 'src', 'app.ts');

const failures = [];
const check = (label, cond, hint) => {
  if (!cond) failures.push({ label, hint });
};

if (!existsSync(APP_TS)) {
  console.error('[security-headers-invariants] ✗ src/app.ts not found');
  process.exit(1);
}
const src = readFileSync(APP_TS, 'utf8');

// Isolate the buildHelmetOptions function body (helmet checks operate on it).
const fnStart = src.indexOf('function buildHelmetOptions');
const helmetFn = fnStart === -1 ? '' : src.slice(fnStart, src.indexOf('\nfunction ', fnStart + 1) === -1 ? undefined : src.indexOf('\nfunction ', fnStart + 1));

check('helmet imported', /import\s+helmet\s+from\s+['"]helmet['"]/.test(src), "add `import helmet from 'helmet'`");
check('helmet mounted (app.use(helmet(...)))', /app\.use\(\s*helmet\(/.test(src), 'mount helmet in applyGlobalMiddleware');
check('buildHelmetOptions present', helmetFn.length > 0, 'restore the per-env helmet options builder');

// 1. HSTS
const hstsMatch = helmetFn.match(/hsts:\s*\{([^}]*)\}/);
const hstsBody = hstsMatch ? hstsMatch[1] : '';
const maxAgeMatch = hstsBody.match(/maxAge:\s*([\d_]+)/);
const maxAge = maxAgeMatch ? Number(maxAgeMatch[1].replace(/_/g, '')) : 0;
check('HSTS maxAge >= 2y (63072000s)', maxAge >= 63_072_000, `prod HSTS maxAge is ${String(maxAge)} — must be >= 63072000 for preload-list eligibility`);
check('HSTS includeSubDomains:true', /includeSubDomains:\s*true/.test(hstsBody), 'prod HSTS must set includeSubDomains:true');
check('HSTS preload:true', /preload:\s*true/.test(hstsBody), 'prod HSTS must set preload:true');

// 2. CSP enabled in prod (object form with directives, not just `false`)
check('CSP enabled in prod (directives object)', /contentSecurityPolicy:\s*\{\s*directives:/.test(helmetFn), 'prod must ship a contentSecurityPolicy with directives — not disabled');

// 3. scriptSrc has no 'unsafe-inline'
const scriptSrcMatch = helmetFn.match(/scriptSrc:\s*\[([^\]]*)\]/);
const scriptSrcBody = scriptSrcMatch ? scriptSrcMatch[1] : '';
check("scriptSrc has NO 'unsafe-inline'", scriptSrcMatch !== null && !/unsafe-inline/.test(scriptSrcBody), "remove 'unsafe-inline' from scriptSrc (XSS surface)");

// 4. frameAncestors 'none' + objectSrc 'none'
check("frameAncestors 'none'", /frameAncestors:\s*\[\s*["']'none'["']\s*\]/.test(helmetFn), "set frameAncestors: [\"'none'\"] (clickjacking)");
check("objectSrc 'none'", /objectSrc:\s*\[\s*["']'none'["']\s*\]/.test(helmetFn), "set objectSrc: [\"'none'\"] (plugin surface)");

// 5. CORS allowedHeaders include tracing headers
const corsMatch = src.match(/allowedHeaders:\s*\[([^\]]*)\]/);
const corsBody = corsMatch ? corsMatch[1] : '';
check("CORS allowedHeaders include 'sentry-trace'", /['"]sentry-trace['"]/.test(corsBody), "keep 'sentry-trace' in allowedHeaders — dropping it strips FE↔BE tracing at preflight");
check("CORS allowedHeaders include 'baggage'", /['"]baggage['"]/.test(corsBody), "keep 'baggage' in allowedHeaders — dropping it strips FE↔BE tracing at preflight");

if (failures.length === 0) {
  console.log('[security-headers-invariants] ✓ prod helmet/CSP/HSTS + CORS tracing-header invariants hold');
  process.exit(0);
}

console.error(`[security-headers-invariants] ✗ ${String(failures.length)} security-header invariant(s) regressed in src/app.ts:`);
for (const f of failures) {
  console.error(`  • ${f.label}`);
  if (f.hint) console.error(`      fix: ${f.hint}`);
}
process.exit(1);
