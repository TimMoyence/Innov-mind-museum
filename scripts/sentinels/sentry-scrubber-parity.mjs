#!/usr/bin/env node
/**
 * Sentinel: sentry-scrubber-parity
 *
 * Guards the post-2026-05-13 contract: the PII-redaction LOGIC for Sentry
 * events lives in EXACTLY one place — `packages/musaium-shared/src/observability/
 * sentry-scrubber.ts`. Each app keeps a thin wrapper that ONLY injects its
 * platform-specific `hashEmail` and re-exports the bound API.
 *
 * What this sentinel checks:
 *
 *   1. The canonical file exports the audited regex constants and helpers.
 *      Hash a snapshot so any silent edit (e.g. tightening a regex) is
 *      surfaced — committers must update the hash + paired tests.
 *
 *   2. Each per-app wrapper imports `scrubEvent` / `shouldDropBreadcrumb`
 *      from `@musaium/shared`. If anyone re-introduces local regex/
 *      function bodies the sentinel goes red.
 *
 *   3. Each per-app wrapper provides a `hashEmail` function (the ONLY
 *      legitimate per-app divergence). Missing → red.
 *
 * Exit 0 = pass / 1 = drift detected.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const CANONICAL = path.join(
  repoRoot,
  'packages',
  'musaium-shared',
  'src',
  'observability',
  'sentry-scrubber.ts',
);

const WRAPPERS = [
  {
    label: 'museum-backend',
    file: path.join(repoRoot, 'museum-backend', 'src', 'shared', 'observability', 'sentry-scrubber.ts'),
  },
  {
    label: 'museum-frontend',
    file: path.join(repoRoot, 'museum-frontend', 'shared', 'observability', 'sentry-scrubber.ts'),
  },
  {
    label: 'museum-web',
    file: path.join(repoRoot, 'museum-web', 'src', 'lib', 'sentry-scrubber.ts'),
  },
];

/**
 * Pinned hash of the canonical scrubber's load-bearing constants.
 *
 * Updating this hash requires also updating
 * `packages/musaium-shared/src/observability/sentry-scrubber.test.ts` —
 * the golden-input/golden-output fixture is the second half of this gate.
 */
// 2026-05-21 — bumped in lockstep with run /team `2026-05-21-p0-c1-pii-egress` :
//   - SENSITIVE_QUERY_KEYS extended 7→11 (R1, +code/email/phone/state)
//   - scrubEvent now traverses event.tags (R2, scrubRecord + SENSITIVE_HEADER_REGEX + scrubUrl)
//   - new exported helper isUrlLikeValue (BE captureExceptionWithContext source scrub)
// 2026-05-26 — bumped in lockstep with run /team `2026-05-26-chat-pipeline-hardening` (A-02) :
//   - SENSITIVE_QUERY_KEYS extended 11→16 (D3, +x-amz-signature/x-amz-credential/
//     x-amz-security-token/sig/signature) to close the presigned-S3 / signed-URL leak.
//     Inherited by the central log redaction in museum-backend/src/shared/logger/logger.ts.
// Golden fixture asserting the new behaviour : packages/musaium-shared/src/observability/sentry-scrubber.test.ts
const CANONICAL_HASH = 'b1e98f5e569744cebe37dd2d1609531d41f4311fb3df3ea9c48ef70945d83e2b';

const REQUIRED_CANONICAL_EXPORTS = [
  'SENSITIVE_HEADER_REGEX',
  'SENSITIVE_FIELD_REGEX',
  'SENSITIVE_QUERY_KEYS',
  'SENSITIVE_BREADCRUMB_PATHS',
  'REDACTED',
  'scrubHeaders',
  'scrubRecord',
  'scrubUrl',
  // 2026-05-21 — added in run /team `2026-05-21-p0-c1-pii-egress` (R3) :
  // re-used by the BE wrapper `captureExceptionWithContext` to scrub URL-like
  // tag values upstream of `scope.setTag`. Defense-in-depth with scrubEvent's
  // event.tags traversal (R2).
  'isUrlLikeValue',
  'scrubEvent',
  'shouldDropBreadcrumb',
];

const fail = (msg) => {
  console.error(`[sentinel:sentry-scrubber-parity] FAIL — ${msg}`);
  process.exit(1);
};

if (!fs.existsSync(CANONICAL)) {
  fail(`canonical file missing: ${path.relative(repoRoot, CANONICAL)}`);
}

const canonicalSource = fs.readFileSync(CANONICAL, 'utf8');

for (const symbol of REQUIRED_CANONICAL_EXPORTS) {
  // Accept either `export const X` / `export function X` / `export {X` patterns.
  const exportRegex = new RegExp(`export\\s+(const|function|let|var|type|interface)\\s+${symbol}\\b`);
  if (!exportRegex.test(canonicalSource)) {
    fail(
      `canonical scrubber is missing required export "${symbol}". Either re-export it or update REQUIRED_CANONICAL_EXPORTS in this sentinel.`,
    );
  }
}

// Hash the canonical body (excluding the block comment header which can be
// edited without changing behaviour). We pin the line range starting at the
// first `export` so doc-only edits don't trip the gate.
const firstExportIndex = canonicalSource.indexOf('export ');
if (firstExportIndex === -1) {
  fail('canonical scrubber has no `export` statement — unexpected file shape.');
}
const canonicalBody = canonicalSource.slice(firstExportIndex);
const observedHash = createHash('sha256').update(canonicalBody).digest('hex');

if (observedHash !== CANONICAL_HASH) {
  fail(
    [
      'canonical scrubber body hash drifted.',
      `  expected: ${CANONICAL_HASH}`,
      `  observed: ${observedHash}`,
      'Action: review the change. If intentional, update CANONICAL_HASH in this sentinel',
      'AND verify the golden test in packages/musaium-shared/src/observability/sentry-scrubber.test.ts',
      'still asserts the new behaviour.',
    ].join('\n'),
  );
}

// Each per-app wrapper MUST (a) import from @musaium/shared (b) define
// hashEmail. We do NOT enforce a hash on wrappers themselves — they're
// allowed to evolve their hashEmail impl; the parity guarantee is that
// the rest of the logic comes from the shared package.
const IMPORT_RX = /from\s+['"]@musaium\/shared(?:\/observability)?['"]/;
const HASH_EMAIL_RX = /(?:export\s+)?const\s+hashEmail\s*=/;
const LOCAL_REGEX_FORBIDDEN = [
  /\/\^\(authorization\|cookie/,
  /password\|token\|secret\|api/,
];

for (const { label, file } of WRAPPERS) {
  if (!fs.existsSync(file)) {
    fail(`${label}: wrapper missing at ${path.relative(repoRoot, file)}`);
  }
  const src = fs.readFileSync(file, 'utf8');

  if (!IMPORT_RX.test(src)) {
    fail(
      `${label}: ${path.relative(repoRoot, file)} no longer imports from "@musaium/shared". The shared package is the single source of truth — re-introduce the import.`,
    );
  }

  if (!HASH_EMAIL_RX.test(src)) {
    fail(
      `${label}: ${path.relative(repoRoot, file)} no longer declares hashEmail. The wrapper must inject a platform-specific hashEmail (node:crypto on backend, 32-bit fold on FE/Web).`,
    );
  }

  for (const forbidden of LOCAL_REGEX_FORBIDDEN) {
    if (forbidden.test(src)) {
      fail(
        `${label}: ${path.relative(repoRoot, file)} contains a local copy of the SENSITIVE_* regex from the canonical scrubber. Delete it and use the shared export — divergence here is a PII-leak risk.`,
      );
    }
  }
}

console.log('[sentinel:sentry-scrubber-parity] PASS — canonical + 3 wrappers in sync.');
process.exit(0);
