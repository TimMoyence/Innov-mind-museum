#!/usr/bin/env node
/**
 * Sentinel — e2e-only build flags must NEVER live in an env file.
 *
 * WHY (2026-07-14). `CLAUDE.md:164` and `.github/workflows/ci-cd-mobile.yml:1105`
 * both state, in prose, that this sentinel "fails the build if it leaks into a
 * committed file". **It did not exist.** No file, no script entry, no gate — a
 * guard asserted in a comment and never built. Which is exactly why
 * `EXPO_PUBLIC_MAESTRO_AUDIO_FIXTURE=true` had been sitting in
 * `museum-frontend/.env` unnoticed: every local build — including any archive
 * destined for TestFlight — was inlining a STUBBED MICROPHONE into the JS bundle.
 *
 * WHAT MAKES THIS DANGEROUS. Metro inlines every `EXPO_PUBLIC_*` variable it finds
 * in `.env` at bundle time. There is no runtime opt-out: the value is baked into
 * the shipped JS. So a flag that is safe as a per-command export
 * (`EXPO_PUBLIC_MAESTRO_AUDIO_FIXTURE=true xcodebuild …`) becomes a production
 * defect the moment it is written to a file.
 *
 * Each flag below is a TEST SEAM: it makes the app lie on purpose so Maestro can
 * drive it. They belong on the command line of a Maestro job, and nowhere else.
 *
 * SCOPE — both halves matter, and each catches what the other cannot:
 *   • Local `museum-frontend/.env*` (untracked): invisible to CI, and it is THE
 *     file Metro reads. The pre-push gate is the only thing that can see it.
 *   • Tracked config (`.env.example`, `app.config.ts`, `app.json`, `eas.json`):
 *     visible to CI, and a leak there ships to every developer.
 *
 * The Maestro CI jobs set these flags via `env:` in the workflow, which this
 * sentinel deliberately does NOT scan — that is the one legitimate home.
 *
 * Usage: `node scripts/sentinels/e2e-flags-not-in-env.mjs` (exit 1 on any leak)
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const FE = join(REPO_ROOT, 'museum-frontend');

/** Build seams that make the app behave as a test double. Never in a file. */
const FORBIDDEN_FLAGS = [
  {
    name: 'EXPO_PUBLIC_MAESTRO_AUDIO_FIXTURE',
    why: 'bakes a STUBBED MICROPHONE into the bundle (features/chat/application/maestroAudioFixture.ts) — a shipped archive would replay a canned clip instead of recording',
  },
  {
    name: 'EXPO_PUBLIC_E2E_DEV_ROUTES',
    why: 'exposes the (dev) route group in a Release build (shared/lib/e2eBuildFlags.ts) — dev-only screens reachable by deeplink in production',
  },
  {
    name: 'EXPO_PUBLIC_E2E_LOCAL_BACKEND',
    why: 'forces the API base URL to a local backend (api-url.config.js) — a shipped build would point at localhost, cf. INC-2026-06-06-build-localhost',
  },
];

/** Tracked files that ship to every developer. */
const TRACKED_TARGETS = ['.env.example', 'app.config.ts', 'app.json', 'eas.json'];

const envFiles = existsSync(FE)
  ? readdirSync(FE)
      .filter((f) => f === '.env' || f.startsWith('.env.'))
      .filter((f) => !f.endsWith('.example')) // the example is scanned as a tracked target
      .map((f) => join(FE, f))
  : [];

const trackedFiles = TRACKED_TARGETS.map((f) => join(FE, f)).filter((p) => existsSync(p));

const violations = [];

for (const file of [...envFiles, ...trackedFiles]) {
  let lines;
  try {
    lines = readFileSync(file, 'utf8').split('\n');
  } catch {
    continue;
  }

  lines.forEach((line, i) => {
    // Ignore comments — documenting the flag is fine, SETTING it is not.
    const code = line.replace(/^\s+/, '');
    if (code.startsWith('#') || code.startsWith('//') || code.startsWith('*')) return;

    for (const flag of FORBIDDEN_FLAGS) {
      // `KEY=value` in a .env, or `KEY: 'value'` / `KEY = "value"` in a config.
      const assigns = new RegExp(`\\b${flag.name}\\b\\s*[:=]`).test(code);
      if (!assigns) continue;

      // A read (`process.env.EXPO_PUBLIC_X`) is not an assignment.
      if (/process\.env\./.test(code)) continue;

      violations.push({
        file: relative(REPO_ROOT, file),
        line: i + 1,
        flag: flag.name,
        why: flag.why,
        text: code.trim(),
      });
    }
  });
}

if (violations.length > 0) {
  console.error('[sentinel:e2e-flags-not-in-env] FAIL — e2e build seam(s) written to a file:\n');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.text}`);
    console.error(`    → ${v.why}\n`);
  }
  console.error('These flags are TEST SEAMS. Metro inlines every EXPO_PUBLIC_* it finds in a');
  console.error('.env into the JS bundle — there is no runtime opt-out, the value ships.');
  console.error('Set them on the COMMAND LINE of the Maestro job instead, e.g.:');
  console.error('  EXPO_PUBLIC_MAESTRO_AUDIO_FIXTURE=true xcodebuild -scheme Musaium …');
  process.exit(1);
}

const scanned = [...envFiles, ...trackedFiles].length;
console.log(
  `[sentinel:e2e-flags-not-in-env] PASS — ${String(FORBIDDEN_FLAGS.length)} e2e seam(s) absent from ${String(scanned)} scanned file(s).`,
);
