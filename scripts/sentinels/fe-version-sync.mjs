#!/usr/bin/env node
/**
 * Sentinel: fe-version-sync
 *
 * Guards the single-source-of-truth contract for the Musaium mobile app
 * version field:
 *
 *   museum-frontend/package.json `.version`
 *     ===
 *   museum-frontend/app.config.ts emitted `version`
 *
 * Why this gate exists:
 *  - `museum-frontend/package.json:4` is the npm manifest (bumped by
 *    Renovate / release tooling).
 *  - `museum-frontend/app.config.ts:121` is what Expo CLI / Xcode Cloud /
 *    EAS read into the published binary (TestFlight, Play Store).
 *  - If app.config.ts had a hard-coded literal like `version: '1.2.3'`
 *    while package.json said `1.2.4`, a build today would ship the wrong
 *    version with no signal — the audit C4 A5 (2026-05-21) found exactly
 *    this drift. C4 fixed app.config.ts to `require('./package.json')` and
 *    this sentinel keeps the invariant.
 *
 * What this sentinel checks:
 *  1. Reads `<FRONTEND_ROOT>/package.json` -> `pkgVersion`.
 *  2. Statically parses `<FRONTEND_ROOT>/app.config.ts` to determine the
 *     `version` string that Expo CLI would emit. Two supported shapes:
 *       (a) `version: '<X>',` literal — emits `<X>` verbatim.
 *       (b) `version: (require('./package.json') as { version: string }).version`
 *           or `version: require('./package.json').version` — emits the
 *           `pkgVersion` read above (the single-source-of-truth path).
 *  3. Exit 0 if both agree; exit 1 with a stderr diff otherwise.
 *
 * <FRONTEND_ROOT> defaults to `museum-frontend/` relative to this script.
 * Override via `FE_VERSION_SYNC_FRONTEND_ROOT=<absolute path>` for unit
 * tests (design D2, see compose-parity.mjs for the same override pattern).
 *
 * Why static parse (vs spawning `expo config --json`):
 *  - Expo CLI requires the frontend's node_modules to evaluate the config.
 *    Unit-test fixtures (tmpdir with just package.json + app.config.ts)
 *    would fail. Static parse covers the two legitimate shapes and is
 *    deterministic — anything more exotic in app.config.ts MUST trip this
 *    sentinel to force human review.
 *
 * Performance: < 100 ms wall-time (no subprocess). Safe in pre-commit
 * Gate 8 (conditional on staged museum-frontend version files) and as a
 * sentinel-mirror CI step (unconditional).
 *
 * Exit 0 = pass / 1 = drift detected / 1 = unparseable app.config.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const FRONTEND_ROOT =
  process.env.FE_VERSION_SYNC_FRONTEND_ROOT ?? path.join(repoRoot, 'museum-frontend');

const PKG_PATH = path.join(FRONTEND_ROOT, 'package.json');
const APP_CONFIG_PATH = path.join(FRONTEND_ROOT, 'app.config.ts');

const fail = (msg) => {
  console.error(`[sentinel:fe-version-sync] FAIL: ${msg}`);
  process.exit(1);
};

if (!fs.existsSync(PKG_PATH)) {
  fail(`package.json not found at ${PKG_PATH}`);
}
if (!fs.existsSync(APP_CONFIG_PATH)) {
  fail(`app.config.ts not found at ${APP_CONFIG_PATH}`);
}

let pkgVersion;
try {
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  pkgVersion = pkg.version;
} catch (err) {
  fail(`could not parse ${PKG_PATH}: ${err instanceof Error ? err.message : String(err)}`);
}

if (typeof pkgVersion !== 'string' || pkgVersion.length === 0) {
  fail(`package.json .version missing or not a string at ${PKG_PATH}`);
}

const appConfigSource = fs.readFileSync(APP_CONFIG_PATH, 'utf8');

// Find the `version: ...` line inside the ExpoConfig literal. We require the
// match to be a `version:` key (with `:`, not just a variable) and to live on
// its own line near the top of the appConfig object.
//
// Two supported shapes:
//   (a) `version: 'X.Y.Z',` — literal string (the legacy/drift-prone shape)
//   (b) `version: (require('./package.json') as { version: string }).version,`
//       or  `version: require('./package.json').version,`
//       (the single-source-of-truth shape that C4 A5 standardised on)
//
// Anything else fails — we want any new shape to force a human review.
const LITERAL_RX = /\bversion:\s*['"]([^'"]+)['"]/;
const REQUIRE_RX = /\bversion:\s*\(?\s*require\s*\(\s*['"]\.\/package\.json['"]\s*\)/;

let emittedVersion;

if (REQUIRE_RX.test(appConfigSource)) {
  // Shape (b) — app.config.ts pulls from package.json at evaluation time.
  // Expo CLI loads app.config.ts via Node `require`, so this resolves to
  // the SAME package.json we just read above.
  emittedVersion = pkgVersion;
} else {
  const literalMatch = LITERAL_RX.exec(appConfigSource);
  if (literalMatch === null) {
    fail(
      `could not find a parseable \`version:\` field in ${APP_CONFIG_PATH}.\n` +
        `  Expected one of:\n` +
        `    version: '<X.Y.Z>',\n` +
        `    version: (require('./package.json') as { version: string }).version,\n` +
        `    version: require('./package.json').version,\n` +
        `  If you intentionally introduced a new shape (e.g. derived from an env var),\n` +
        `  update this sentinel to recognise it.`,
    );
  }
  emittedVersion = literalMatch[1];
}

if (emittedVersion !== pkgVersion) {
  fail(
    `app.config.ts emitted version='${emittedVersion}' but package.json says '${pkgVersion}'.\n` +
      `  Fix by aligning the two files. The C4 A5 (2026-05-21) standardised on:\n` +
      `    version: (require('./package.json') as { version: string }).version,\n` +
      `  in ${path.relative(repoRoot, APP_CONFIG_PATH)} so package.json is the single source of truth.`,
  );
}

console.log(
  `[sentinel:fe-version-sync] PASS — package.json and app.config.ts agree on version ${pkgVersion}`,
);
process.exit(0);
