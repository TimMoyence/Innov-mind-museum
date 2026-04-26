#!/usr/bin/env node
/**
 * Sentinel: env-policy
 *
 * Two checks:
 *   1) No `.env*` file in the staged additions (allow-list: `.env.example`,
 *      `.env*.example`, `.env.template`).
 *   2) Staged additions free of obvious hard-coded API key shapes:
 *      - OpenAI: `sk-` followed by 20+ alnum chars
 *      - Bearer JWT-shape: `Bearer ey...` (3 b64 segments)
 *      - Stripe: `sk_live_` / `pk_live_`
 *      - Generic AWS: `AKIA[0-9A-Z]{16}`
 *
 * Test fixtures and example/template files are skipped to avoid false positives.
 *
 * Exit 0 = pass / 1 = violation.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const ENV_ALLOW = [
  /^\.env\.example$/,
  /^\.env\..+\.example$/,
  /^\.env\.template$/,
  /\.env\.local\.example$/,
];

const SECRET_PATTERNS = [
  { name: 'OpenAI key', re: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'Bearer JWT', re: /\bBearer\s+ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/ },
  { name: 'Stripe live key', re: /\b(sk|pk)_live_[A-Za-z0-9]{20,}\b/ },
  { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GCP service account JSON', re: /"private_key_id"\s*:\s*"[a-f0-9]{40}"/ },
];

const SCAN_SKIP_PATH = [
  /\.env\.example$/,
  /\.env\..+\.example$/,
  /\.env\.template$/,
  /tests?\//,
  /__tests__\//,
  /__mocks__\//,
  /docs?\//,
  /\.md$/,
  /scripts\/sentinels\//,
  /\.gitleaks\.toml$/,
];

function getStagedFiles() {
  try {
    const out = execSync('git diff --cached --name-only --diff-filter=AM', {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

const staged = getStagedFiles();
const violations = [];

// Check 1 — forbidden env files
for (const f of staged) {
  const base = path.basename(f);
  if (!base.startsWith('.env')) continue;
  if (ENV_ALLOW.some((re) => re.test(base))) continue;
  violations.push(`forbidden env file staged: ${f} (allow: .env.example, .env.<scope>.example, .env.template)`);
}

// Check 2 — hard-coded secrets in staged content
for (const f of staged) {
  if (SCAN_SKIP_PATH.some((re) => re.test(f))) continue;
  const abs = path.join(repoRoot, f);
  if (!fs.existsSync(abs)) continue;
  let text;
  try {
    text = fs.readFileSync(abs, 'utf8');
  } catch {
    continue;
  }
  for (const { name, re } of SECRET_PATTERNS) {
    const m = text.match(re);
    if (m) violations.push(`${name} pattern in ${f}: ${m[0].slice(0, 40)}…`);
  }
}

if (violations.length > 0) {
  console.error('[sentinel:env-policy] FAIL:');
  for (const v of violations) console.error(`  - ${v}`);
  console.error('[sentinel:env-policy] Remove the secret AND rotate the credential.');
  process.exit(1);
}

console.log(`[sentinel:env-policy] PASS (${staged.length} staged file(s) scanned)`);
process.exit(0);
