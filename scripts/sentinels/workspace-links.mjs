#!/usr/bin/env node
/**
 * Sentinel: workspace-links
 *
 * Guards the post-2026-05-14 contract: every `file:` protocol dependency
 * declared in museum-backend / museum-frontend / museum-web MUST have a
 * working symlink under `<app>/node_modules/<name>` pointing at a directory
 * that actually exists. The recurring failure mode is:
 *
 *   1. Someone edits `packages/musaium-shared/` or bumps a `file:` dep in
 *      one of the three apps.
 *   2. Other devs pull main but forget to `pnpm install` / `npm install`
 *      in the affected app.
 *   3. Next `pnpm build` / `pnpm dev` fails with
 *      `Module not found: @musaium/shared/observability` or similar.
 *      The error message points at the consuming file, not at the missing
 *      install — diagnosis takes 15-60 minutes the first time.
 *
 * Bug seen 2026-05-14 when `museum-web` was bumped to consume
 * `@musaium/shared` (commit 641968ea4 switched workspace: → file:) but
 * `pnpm install` was never re-run in `museum-web/` locally.
 *
 * What this sentinel checks, per app (backend / frontend / web):
 *
 *   1. Read `<app>/package.json`. For every dep whose specifier starts
 *      with `file:`, verify `<app>/node_modules/<name>` exists.
 *   2. Resolve the symlink and confirm the target directory exists.
 *      A dangling symlink (target deleted) is treated as MISSING.
 *   3. Best-effort: if the package ships a `dist/` (TypeScript-compiled
 *      package), warn if `dist/` is missing — the symlink works but the
 *      consumer will still fail at runtime.
 *
 * Exit 0 = pass. Exit 1 = drift detected.
 *
 * Output is human-readable; the last line tells the dev exactly how to fix:
 *   `pnpm bootstrap`  (at repo root, runs install in all 3 apps).
 *
 * Performance: < 100 ms (just fs.existsSync / fs.readlinkSync). Safe to
 * run in post-merge, post-checkout, and pre-commit hooks.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const APPS = [
  { name: 'museum-backend',  installCmd: 'pnpm install --frozen-lockfile' },
  { name: 'museum-frontend', installCmd: 'npm install' },
  { name: 'museum-web',      installCmd: 'pnpm install --frozen-lockfile' },
];

/**
 * @param {string} appDir absolute path of an app
 * @returns {{ name: string, specifier: string }[]} every `file:` dep declared
 */
function readFileDeps(appDir) {
  const pkgPath = path.join(appDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return [];
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  return Object.entries(deps)
    .filter(([, spec]) => typeof spec === 'string' && spec.startsWith('file:'))
    .map(([name, specifier]) => ({ name, specifier }));
}

/**
 * Check one dep's symlink. Returns { ok, reason } where reason is set on
 * failure to a single-line description of what's wrong.
 *
 * @param {string} appDir
 * @param {{ name: string, specifier: string }} dep
 */
function inspectDep(appDir, dep) {
  const linkPath = path.join(appDir, 'node_modules', dep.name);
  if (!fs.existsSync(linkPath)) {
    return { ok: false, reason: `${linkPath} does not exist` };
  }
  let resolvedTarget;
  try {
    resolvedTarget = fs.realpathSync(linkPath);
  } catch (err) {
    return { ok: false, reason: `${linkPath} is a dangling symlink (${err.code ?? 'ENOENT'})` };
  }
  if (!fs.existsSync(resolvedTarget)) {
    return { ok: false, reason: `${linkPath} → ${resolvedTarget} (target missing)` };
  }
  // Best-effort: the package may ship dist/ as the entry point.
  const targetPkgPath = path.join(resolvedTarget, 'package.json');
  if (fs.existsSync(targetPkgPath)) {
    const targetPkg = JSON.parse(fs.readFileSync(targetPkgPath, 'utf8'));
    const main = targetPkg.main;
    if (typeof main === 'string') {
      const mainPath = path.join(resolvedTarget, main);
      if (!fs.existsSync(mainPath)) {
        return {
          ok: false,
          reason: `${dep.name} symlink OK but entry point missing: ${mainPath} (run \`pnpm --filter ${targetPkg.name ?? dep.name} build\`)`,
        };
      }
    }
  }
  return { ok: true };
}

const failures = [];
for (const app of APPS) {
  const appDir = path.join(repoRoot, app.name);
  if (!fs.existsSync(appDir)) {
    failures.push({ app: app.name, reason: `app directory missing: ${appDir}` });
    continue;
  }
  const deps = readFileDeps(appDir);
  for (const dep of deps) {
    const result = inspectDep(appDir, dep);
    if (!result.ok) {
      failures.push({ app: app.name, dep: dep.name, reason: result.reason, installCmd: app.installCmd });
    }
  }
}

if (failures.length === 0) {
  // Silent on success — keep hooks quiet.
  process.exit(0);
}

console.error('[workspace-links] ✗ broken file: protocol links detected:\n');
for (const f of failures) {
  console.error(`  • ${f.app} → ${f.dep ?? '(app)'}`);
  console.error(`      ${f.reason}`);
  if (f.installCmd) {
    console.error(`      fix: cd ${f.app} && ${f.installCmd}`);
  }
  console.error('');
}
console.error('[workspace-links] one-shot fix for all apps:');
console.error('    pnpm bootstrap   # runs install in museum-backend, museum-frontend, museum-web');
console.error('');
console.error('[workspace-links] root cause is usually:');
console.error('  - you pulled main but forgot to install in one or more apps');
console.error('  - someone changed packages/musaium-shared without rebuilding (run `pnpm --dir packages/musaium-shared build`)');
process.exit(1);
