#!/usr/bin/env node
// @ts-check
/**
 * Hexagonal domain-purity sentinel (run 2026-06-04-hexagonal-boundaries-enforcement).
 * Defense-in-depth backstop for spec R3 / R8 + the Independence NFR.
 *
 * The lint-plugin `boundaries/dependencies` rule is the PRIMARY guard, but it was
 * a proven no-op for months (a missing `import/resolver` silently disarmed it).
 * This sentinel is a SECOND, INDEPENDENT layer: a filesystem walk that does NOT
 * load, import, or execute the lint config file or any lint plugin (Independence
 * NFR — the file contains no lint-tooling import whatsoever). If a future edit
 * re-regresses the lint config back to a no-op, this sentinel STILL fails on any
 * domain-layer leak.
 *
 * Invariant enforced (spec §6 glossary "Domain layer"): no file under
 * `src/modules/<m>/domain/**` (and `src/modules/<m>/core/domain/**`) may import a
 * module that resolves into another layer:
 *   `/adapters/`, `/useCase/`, `/application/`, `/infrastructure/`,
 *   `/core/useCase/`, or the shared data layer (`@data/` alias or `/data/db/`).
 * Both static `import ... from '<spec>'` / `export ... from '<spec>'` and dynamic
 * `import('<spec>')` specifiers are scanned (alias AND relative forms).
 *
 * Output: a SORTED offender list `file:line -> specifier` to stderr; exit 1 if
 * non-empty, 0 if clean. Sorted so CI diffs are stable (spec Determinism NFR).
 *
 * Scan root overridable via `HEXAGONAL_DOMAIN_PURITY_ROOT` (mirrors the
 * `LLM_COST_GUARD_AUTH_ROOT` pattern in the sibling sentinels) so the driver test
 * can point it at a temp fixture tree. Default = `<repo>/museum-backend/src/modules`.
 *
 * Run: pnpm sentinel:hexagonal-domain-purity   (exit 0 = pass, 1 = leak)
 *
 * NOTE (RED phase, run 2026-06-04-hexagonal-boundaries-enforcement): on the REAL
 * tree this sentinel currently reports exactly ONE offender — the still-present
 * ARCH-02 leak (`chat-orchestrator.port.ts:9` importing the useCase layer). Its
 * driver test asserts `[]` on the clean tree, so that test FAILS today and turns
 * GREEN once T1.4 relocates `KnowledgeRouterSource` into the domain layer. This is
 * tooling/test artefact code (NOT applicative `src/**` code).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// scripts/sentinels -> museum-backend
const BACKEND_ROOT = resolve(__dirname, '../..');
const MODULES_ROOT = resolve(
  process.env.HEXAGONAL_DOMAIN_PURITY_ROOT ?? resolve(BACKEND_ROOT, 'src/modules'),
);

/** Domain sub-directories scanned within each module. */
const DOMAIN_SUBDIRS = ['domain', join('core', 'domain')];

/**
 * Forbidden path fragments: an import specifier containing any of these resolves
 * into a non-domain layer and is a domain-purity violation. Covers alias AND
 * relative forms (the fragment appears in both `@modules/x/useCase/...` and
 * `../../useCase/...`). `@data/` and `/data/db/` both catch the shared data layer.
 */
const FORBIDDEN_FRAGMENTS = [
  '/adapters/',
  '/useCase/',
  '/application/',
  '/infrastructure/',
  '/core/useCase/',
  '@data/',
  '/data/db/',
];

/**
 * Matches the specifier of a static import/export-from or a dynamic import.
 *   group 1 = static `from '<spec>'`
 *   group 2 = dynamic `import('<spec>')`
 */
const SPECIFIER_RE =
  /(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * Recursively collects `.ts` source files under `dir` (skips `*.test.ts` and
 * `*.spec.ts`). Returns [] if `dir` does not exist.
 * @param {string} dir
 * @returns {string[]}
 */
function collectTsFiles(dir) {
  /** @type {string[]} */
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (
      entry.isFile() &&
      full.endsWith('.ts') &&
      !full.endsWith('.test.ts') &&
      !full.endsWith('.spec.ts') &&
      !full.endsWith('.d.ts')
    ) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Collects every domain-layer `.ts` file across all modules under the scan root.
 * @returns {string[]}
 */
function collectDomainFiles() {
  /** @type {string[]} */
  const files = [];
  let modules;
  try {
    modules = readdirSync(MODULES_ROOT, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const mod of modules) {
    if (!mod.isDirectory()) continue;
    for (const sub of DOMAIN_SUBDIRS) {
      const domainDir = join(MODULES_ROOT, mod.name, sub);
      let isDir = false;
      try {
        isDir = statSync(domainDir).isDirectory();
      } catch {
        isDir = false;
      }
      if (isDir) files.push(...collectTsFiles(domainDir));
    }
  }
  return files;
}

/**
 * Scans the domain tree and returns the sorted offender list. Each entry is
 * `<relPath>:<line> -> <specifier>` where relPath is relative to the scan root.
 * @returns {string[]}
 */
export function findDomainPurityOffenders() {
  /** @type {string[]} */
  const offenders = [];
  for (const file of collectDomainFiles()) {
    const lines = readFileSync(file, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (typeof line !== 'string') continue;
      SPECIFIER_RE.lastIndex = 0;
      let match;
      while ((match = SPECIFIER_RE.exec(line)) !== null) {
        const spec = match[1] ?? match[2];
        if (!spec) continue;
        if (FORBIDDEN_FRAGMENTS.some((frag) => spec.includes(frag))) {
          const rel = relative(MODULES_ROOT, file);
          offenders.push(`${rel}:${i + 1} -> ${spec}`);
        }
      }
    }
  }
  return offenders.sort();
}

function main() {
  const offenders = findDomainPurityOffenders();
  if (offenders.length > 0) {
    console.error(
      `[sentinel:hexagonal-domain-purity] FAIL — ${offenders.length} domain-layer leak(s):`,
    );
    for (const o of offenders) console.error(`  - ${o}`);
    console.error(
      '  A domain/** file must not import adapters/useCase/application/infrastructure/data.',
    );
    process.exit(1);
  }
  console.log('[sentinel:hexagonal-domain-purity] PASS — no domain-layer leaks.');
}

// Run as CLI only (not when imported by the driver test).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
