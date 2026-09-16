#!/usr/bin/env node
/**
 * Sentinel — the e2e build seams must NEVER reach a shipped bundle.
 *
 * Three `EXPO_PUBLIC_*` flags exist purely so the Maestro suite can drive a
 * RELEASE binary. Each is inlined by Metro at bundle time, so whichever value is
 * present when the bundle is built is baked in forever:
 *
 *   EXPO_PUBLIC_E2E_LOCAL_BACKEND  → keeps a Release build on the `development`
 *                                    variant: localhost API + preview bundle id.
 *   EXPO_PUBLIC_E2E_DEV_ROUTES     → makes the `(dev)` route group reachable in a
 *                                    Release bundle.
 *   EXPO_PUBLIC_MAESTRO_AUDIO_FIXTURE → bakes the canned audio clip into the
 *                                    recorder.
 *
 * They are safe ONLY because they are set exclusively in the Maestro build jobs
 * (.github/workflows/ci-cd-mobile.yml). The day one of them lands in a checked-in
 * env file, `eas.json`, or a release script, an Archive silently inherits it —
 * and an App Store build would ship pointing at `http://localhost:3000`, with its
 * dev routes live, and its microphone stubbed. `api-url.config.js`'s R4 fail-loud
 * throw does NOT catch this: it only fires for `variant === 'production'`, and
 * that is exactly the variant the flag suppresses.
 *
 * Convention over configuration: `.env*` files are gitignored, so this checks the
 * working tree too — a local `.env` carrying the flag would poison any Archive
 * built on that machine (Expo loads `.env` into `process.env` before evaluating
 * `app.config.ts`).
 *
 * Exit 0 = clean. Exit 1 = a seam is leaking; the message names file + line.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO_ROOT = join(FE_ROOT, '..');

const E2E_FLAGS = [
  'EXPO_PUBLIC_E2E_LOCAL_BACKEND',
  'EXPO_PUBLIC_E2E_DEV_ROUTES',
  'EXPO_PUBLIC_MAESTRO_AUDIO_FIXTURE',
];

/** Files that must never carry an e2e seam. */
const forbiddenTargets = () => {
  const targets = [];

  // every .env* in the frontend (gitignored, but they DO feed a local Archive)
  for (const name of readdirSync(FE_ROOT)) {
    if (name.startsWith('.env')) targets.push(join(FE_ROOT, name));
  }

  // release configuration that a store build actually reads
  for (const rel of ['eas.json', 'app.json', 'app.config.ts']) {
    const p = join(FE_ROOT, rel);
    if (existsSync(p)) targets.push(p);
  }

  return targets;
};

/** The ONE file allowed to mention the flags: the Maestro CI workflow. */
const ALLOWED = join(REPO_ROOT, '.github', 'workflows', 'ci-cd-mobile.yml');

/** Is the file tracked by git (i.e. does it travel to a build machine)? */
const isTracked = (file) => {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', file], {
      cwd: REPO_ROOT,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
};

/** Committed seams SHIP. Local `.env` seams only poison a build made on this box. */
const shipping = [];
const localOnly = [];

for (const file of forbiddenTargets()) {
  if (file === ALLOWED) continue;

  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    // Ignore comments — the flags are legitimately DOCUMENTED in app.config.ts.
    const code = line.split(/(?:\/\/|#)/, 1)[0];
    for (const flag of E2E_FLAGS) {
      // A mention is only a violation when the flag is being ASSIGNED a value.
      // The optional closing quote matters: in JSON/TS the key is written
      // `"EXPO_PUBLIC_E2E_DEV_ROUTES": "true"`, so the separator does not sit
      // directly against the name. Without it the sentinel silently missed every
      // leak into app.json / eas.json / app.config.ts — i.e. exactly the committed
      // files it exists to protect.
      if (new RegExp(`${flag}["']?\\s*[:=]`).test(code)) {
        const hit = `${file.replace(`${REPO_ROOT}/`, '')}:${i + 1}  ${line.trim()}`;
        (isTracked(file) ? shipping : localOnly).push(hit);
      }
    }
  });
}

if (localOnly.length > 0) {
  // NOT fatal: these files are gitignored, so neither Xcode Cloud nor EAS (both
  // build from the repo) can see them. But `eas build --local` and a hand-rolled
  // Xcode Archive DO read them, and Expo loads `.env` into `process.env` before
  // evaluating `app.config.ts` — so a release built on this machine would inherit
  // the seam silently.
  console.warn(
    '\n[sentinel:e2e-flags] WARNING — e2e seam present in a local (gitignored) env file:\n',
  );
  for (const v of localOnly) console.warn(`  ${v}`);
  console.warn(
    '\n  Harmless for Xcode Cloud / EAS (they build from the repo, not from your disk),\n' +
      '  but ANY release built on THIS machine (eas build --local, Xcode Archive) bakes it in.\n' +
      '  Prefer passing the flag on the command line for local Maestro runs:\n' +
      '    EXPO_PUBLIC_MAESTRO_AUDIO_FIXTURE=true npx expo run:ios --configuration Release\n',
  );
}

if (shipping.length > 0) {
  console.error('\n[sentinel:e2e-flags] e2e build seam leaked into a COMMITTED file:\n');
  for (const v of shipping) console.error(`  ${v}`);
  console.error(
    '\nThese flags are inlined into the JS bundle at build time, and this file travels to\n' +
      'the build machine. A release build picking one up ships with a localhost API, live\n' +
      'dev routes, or a stubbed microphone — and api-url.config.js R4 does NOT catch it\n' +
      '(it only fires for variant === "production", the very variant the flag suppresses).\n' +
      'Set them ONLY in the Maestro build jobs of .github/workflows/ci-cd-mobile.yml.\n',
  );
  process.exit(1);
}

console.log(
  `[sentinel:e2e-flags] OK — no e2e seam in any committed build input (${E2E_FLAGS.length} flags checked).`,
);
