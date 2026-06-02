#!/usr/bin/env node
/**
 * Sentinel: net-fault-prod-guard  (Wave 2, Decision D3 — W2-10)
 *
 * The L2 network-fault injector (`createNetProfileFaultMiddleware`) is a
 * TEST-ONLY middleware that deliberately delays, fails, and trickles HTTP
 * responses. Decision D3 mandates it is OFF in production UNCONDITIONALLY, with
 * NO escape hatch (stricter than the chaos rate, which authorises a non-zero
 * prod rate via the `I-know-what-I-am-doing` literal). This sentinel asserts the
 * structural invariants a future refactor could silently regress:
 *
 *   (a) No `.env*` file sets NET_FAULT_INJECTION_ENABLED to a truthy value
 *       (1/true/yes/on) — committing such a line would arm the injector by
 *       default in whatever environment loads that file.
 *   (b) The app.ts mount of the injector is CONDITIONAL on `shouldMountNetFault`
 *       — an unconditional `app.use(createNetProfileFaultMiddleware...)` would
 *       mount it in every environment, including prod.
 *   (c) `validateProductionEnv` contains the NET_FAULT_INJECTION_ENABLED
 *       boot-throw — removing it drops the fail-fast on a stray prod flag.
 *   (d) The `/api/__test__/net-fault/reset` control route is registered INSIDE
 *       the `shouldMountNetFault` guard block — registering it unconditionally
 *       would expose a state-mutating test endpoint in prod.
 *   (e) The middleware source contains NO production escape-hatch token (the
 *       `I-know-what-I-am-doing` literal class) — re-introducing one re-opens
 *       the exact prod footgun D3 forbids.
 *
 * Wired into `pnpm lint` (`sentinel:net-fault-prod-guard`) + sentinel-mirror.yml
 * (UFR-020 anti-bypass). Pure-Node structural string checks (no AST/YAML dep;
 * mirrors security-headers-invariants.mjs / request-decompression-invariants.mjs).
 *
 * Path overrides via env (so the self-test can point at temp fixtures WITHOUT
 * mutating the real tree — mirrors the parity sentinel's *_PATH precedent):
 *   - NET_FAULT_ENV_GLOB_DIR   → directory scanned for `.env*` files
 *   - NET_FAULT_APP_TS         → app.ts path (mount + reset-route scan)
 *   - NET_FAULT_VALIDATION_TS  → env.production-validation.ts path (boot-throw scan)
 *   - NET_FAULT_MIDDLEWARE_TS  → middleware path (escape-hatch token scan)
 *
 * Exit 0 = invariants hold. Exit 1 + non-empty stderr = a guard regressed.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = join(__dirname, '..', '..');

const ENV_GLOB_DIR = process.env.NET_FAULT_ENV_GLOB_DIR ?? BACKEND_ROOT;
const APP_TS = process.env.NET_FAULT_APP_TS ?? join(BACKEND_ROOT, 'src', 'app.ts');
const VALIDATION_TS =
  process.env.NET_FAULT_VALIDATION_TS ??
  join(BACKEND_ROOT, 'src', 'config', 'env.production-validation.ts');
const MIDDLEWARE_TS =
  process.env.NET_FAULT_MIDDLEWARE_TS ??
  join(BACKEND_ROOT, 'src', 'shared', 'net-shaping', 'net-profile-fault.middleware.ts');

const FLAG = 'NET_FAULT_INJECTION_ENABLED';
/** Prod escape-hatch token class forbidden by D3 (the chaos-rate literal). */
const ESCAPE_HATCH_TOKENS = ['I-know-what-I-am-doing'];

const failures = [];
const fail = (label, hint) => failures.push({ label, hint });

const readIfExists = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null);

// ---------------------------------------------------------------------------
// (a) No .env* file sets the flag truthy.
// ---------------------------------------------------------------------------
if (!existsSync(ENV_GLOB_DIR)) {
  fail(`env dir not found: ${ENV_GLOB_DIR}`, 'set NET_FAULT_ENV_GLOB_DIR or restore the directory');
} else {
  const envFiles = readdirSync(ENV_GLOB_DIR).filter((name) => name.startsWith('.env'));
  for (const name of envFiles) {
    const content = readFileSync(join(ENV_GLOB_DIR, name), 'utf8');
    // Match `NET_FAULT_INJECTION_ENABLED = <truthy>` ignoring leading `export`/whitespace
    // and surrounding quotes. Truthy set mirrors `toBoolean` (1/true/yes/on).
    const re = new RegExp(
      `^\\s*(?:export\\s+)?${FLAG}\\s*=\\s*["']?(1|true|yes|on)["']?\\s*$`,
      'im',
    );
    if (re.test(content)) {
      fail(
        `${name} ENABLES ${FLAG} (truthy)`,
        `the L2 fault injector is TEST-ONLY (D3) — set ${FLAG}=false or remove the line from ${name}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// (b) + (d) app.ts: mount conditional on shouldMountNetFault, reset route gated.
// ---------------------------------------------------------------------------
const app = readIfExists(APP_TS);
if (app === null) {
  fail(`app.ts not found: ${APP_TS}`, 'set NET_FAULT_APP_TS or restore src/app.ts');
} else {
  // The injector mount is `app.use((create)?NetProfileFaultMiddleware...)`.
  // Match on the `app.use(` call site (NOT the bare import token, which sits
  // outside the guard block). Both the real factory call
  // (`createNetProfileFaultMiddleware(...)`) and the self-test fixture's bare
  // `netProfileFaultMiddleware` reference are accepted.
  const mountRe = /app\.use\(\s*(?:create)?[Nn]etProfileFaultMiddleware/g;
  const mountIdx = (() => {
    const m = mountRe.exec(app);
    return m ? m.index : -1;
  })();
  const hasMount = mountIdx >= 0;
  const guardIdx = app.indexOf('shouldMountNetFault');

  // (b) The mount must be CONDITIONAL: a `shouldMountNetFault(...)` guard must
  //     appear BEFORE the injector mount, and that guard must open a block (`{`)
  //     that encloses the mount.
  const guardBlock = extractGuardBlock(app);
  if (hasMount) {
    if (guardIdx < 0 || guardBlock === null) {
      fail(
        'app.ts mounts the net-fault injector UNCONDITIONALLY (no shouldMountNetFault guard)',
        'wrap the app.use(createNetProfileFaultMiddleware(...)) mount in if (shouldMountNetFault(process.env.NET_FAULT_INJECTION_ENABLED, env.nodeEnv)) { ... }',
      );
    } else {
      const mountInsideGuard = mountIdx > guardBlock.start && mountIdx < guardBlock.end;
      if (!mountInsideGuard) {
        fail(
          'app.ts net-fault injector mount is OUTSIDE the shouldMountNetFault guard block',
          'move the app.use(createNetProfileFaultMiddleware(...)) mount inside the if (shouldMountNetFault(...)) { ... } block',
        );
      }

      // (d) The reset route must be REGISTERED INSIDE the same guard block.
      //     Match the `app.post('.../net-fault/reset'...)` route registration
      //     (NOT a bare doc-comment mention of the path) so prose referencing
      //     the route cannot trip the gate.
      const resetMatch = app.match(/app\.(?:post|use|all)\([^)]*net-fault\/reset/);
      const resetIdx = resetMatch ? resetMatch.index : -1;
      if (resetIdx >= 0) {
        const resetInsideGuard = resetIdx > guardBlock.start && resetIdx < guardBlock.end;
        if (!resetInsideGuard) {
          fail(
            'the net-fault reset route is registered UNGATED (outside the shouldMountNetFault guard)',
            'register POST /api/__test__/net-fault/reset INSIDE the if (shouldMountNetFault(...)) { ... } block so it does not exist in production',
          );
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// (c) validateProductionEnv contains the NET_FAULT_INJECTION_ENABLED boot-throw.
// ---------------------------------------------------------------------------
const validation = readIfExists(VALIDATION_TS);
if (validation === null) {
  fail(
    `env.production-validation.ts not found: ${VALIDATION_TS}`,
    'set NET_FAULT_VALIDATION_TS or restore the file',
  );
} else {
  // A `throw` whose statement references the flag (boot-throw present).
  const re = new RegExp(`throw[\\s\\S]{0,400}?${FLAG}|${FLAG}[\\s\\S]{0,400}?throw`, 'm');
  if (!re.test(validation)) {
    fail(
      `validateProductionEnv is MISSING the ${FLAG} boot-throw`,
      `re-add the unconditional throw on a truthy ${FLAG} in production (Decision D3)`,
    );
  }
}

// ---------------------------------------------------------------------------
// (e) The middleware source contains NO prod escape-hatch token.
// ---------------------------------------------------------------------------
const middleware = readIfExists(MIDDLEWARE_TS);
if (middleware === null) {
  fail(
    `net-profile-fault.middleware.ts not found: ${MIDDLEWARE_TS}`,
    'set NET_FAULT_MIDDLEWARE_TS or restore the file',
  );
} else {
  for (const token of ESCAPE_HATCH_TOKENS) {
    // Ignore the token if it only appears inside a comment that explicitly says
    // there is NO escape hatch (the middleware docblock references the class).
    const lines = middleware.split('\n');
    const offending = lines.find(
      (line) => line.includes(token) && !/\/\/|\/\*|\*/.test(line.trimStart().slice(0, 2)),
    );
    if (offending !== undefined) {
      fail(
        `net-profile-fault.middleware.ts contains a prod escape-hatch token ("${token}")`,
        'remove the escape hatch — the L2 injector must be OFF in prod UNCONDITIONALLY (Decision D3)',
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Verdict.
// ---------------------------------------------------------------------------
if (failures.length === 0) {
  console.log(
    '[net-fault-prod-guard] ✓ D3 prod-refusal invariants hold (no .env enables it, mount + reset gated, boot-throw present, no escape hatch)',
  );
  process.exit(0);
}

console.error(`[net-fault-prod-guard] ✗ ${String(failures.length)} D3 guard(s) regressed:`);
for (const f of failures) {
  console.error(`  • ${f.label}`);
  if (f.hint) console.error(`      fix: ${f.hint}`);
}
process.exit(1);

/**
 * Extracts the `{ ... }` block opened by the FIRST `if (shouldMountNetFault...)`
 * by brace-matching from the `{` that follows the guard call. Returns the
 * `[start, end)` offsets of the block body, or null if no guarded block exists.
 *
 * @param source - The app.ts source text.
 * @returns The block bounds or null.
 */
function extractGuardBlock(source) {
  // Match the `if (...shouldMountNetFault...)` HEAD (NOT the import line, which
  // also references the symbol). The `{` we brace-match from must be the one
  // opening the guarded block, so we anchor on the `if (` containing the call.
  const guardHead = source.match(/if\s*\([^)]*shouldMountNetFault[\s\S]*?\)\s*\{/);
  if (!guardHead || guardHead.index === undefined) return null;
  // `braceOpen` = the `{` at the END of the matched head.
  const braceOpen = guardHead.index + guardHead[0].length - 1;
  let depth = 0;
  for (let i = braceOpen; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return { start: braceOpen, end: i };
    }
  }
  return null;
}
