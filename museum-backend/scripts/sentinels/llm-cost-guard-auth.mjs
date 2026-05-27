#!/usr/bin/env node
// @ts-check
/**
 * W1-C5 — paid-route authentication sentinel (run 2026-05-26-kr-domains).
 *
 * Guards against a FUTURE `*.route.ts` that mounts the paid-call cost guard
 * (`llmCostGuard`) on a route WITHOUT an `isAuthenticated` gate upstream in the
 * SAME mount call. The anonymous bypass inside `llmCostGuard` is intentional and
 * LOUD (warn + `llm_cost_anon_bypass_total`, #300) — this sentinel does NOT remove
 * it. It prevents a STRUCTURAL regression: a route mounting the cost guard with no
 * auth gate has no stable per-user key on the anon path, so the per-user daily cap
 * is silently un-enforceable for that route.
 *
 * Detection (regex AST-lite, NOT a full TS AST — KISS, mirrors the other repo
 * sentinels which are all string/regex based; design.md W1-C5):
 *   1. Walk `*.route.ts` files under the scan root.
 *   2. For each file that IMPORTS `llmCostGuard` (confirms the identifier is the
 *      real middleware, not a comment / unrelated token), split the source into
 *      balanced `router.<verb>(...)` mount-call blocks.
 *   3. A mount block referencing `llmCostGuard` MUST also reference
 *      `isAuthenticated` earlier (positionally upstream) in the same call.
 *   4. exit 1 + list offending files on >=1 violation; exit 0 + summary otherwise.
 *
 * Pattern covered = `router.<verb>(...)` (the only mount form used today, verified
 * on chat-media / chat-message / chat-describe). A future `app.use(path, ...)` or
 * `.route(path).post(...)` mount would need this sentinel extended.
 *
 * Scan root overridable via `LLM_COST_GUARD_AUTH_ROOT` (mirrors
 * `STRYKER_GATE_ROOT`) so tests can point it at a temp fixture dir. Default =
 * `<repo>/museum-backend/src`.
 *
 * Run: pnpm sentinel:llm-cost-guard-auth  (exit 0 = pass, 1 = violation)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(process.env.LLM_COST_GUARD_AUTH_ROOT ?? resolve(__dirname, '../../src'));

const COST_GUARD_ID = 'llmCostGuard';
const AUTH_ID = 'isAuthenticated';
const ROUTE_FILE_SUFFIX = '.route.ts';

/** Verbs that mount a handler chain on an Express router. */
const ROUTER_VERB_RE = /\brouter\s*\.\s*(get|post|put|patch|delete|all|use)\s*\(/g;

/**
 * Recursively collects `*.route.ts` files under `dir`. Skips node_modules / dist /
 * build artefacts so the real-src run stays fast and deterministic.
 * @param {string} dir
 * @returns {string[]}
 */
function collectRouteFiles(dir) {
  /** @type {string[]} */
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      out.push(...collectRouteFiles(full));
    } else if (entry.endsWith(ROUTE_FILE_SUFFIX)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Extracts the argument text of each `router.<verb>(...)` mount call via balanced
 * paren matching from the `(` following the verb. The caller only needs to test
 * identifier presence/order.
 * @param {string} src
 * @returns {string[]} one entry per mount call (the text inside the outer parens)
 */
function extractMountCalls(src) {
  /** @type {string[]} */
  const calls = [];
  let m;
  ROUTER_VERB_RE.lastIndex = 0;
  while ((m = ROUTER_VERB_RE.exec(src)) !== null) {
    // `m.index` is at `router`; the matched group ends at the opening `(`.
    const openParen = m.index + m[0].length - 1;
    let depth = 0;
    let i = openParen;
    for (; i < src.length; i += 1) {
      const ch = src[i];
      if (ch === '(') depth += 1;
      else if (ch === ')') {
        depth -= 1;
        if (depth === 0) {
          i += 1;
          break;
        }
      }
    }
    calls.push(src.slice(openParen + 1, i - 1));
    // Continue scanning AFTER this call's closing paren to avoid re-matching
    // nested `router.` occurrences inside the args (none today, but safe).
    ROUTER_VERB_RE.lastIndex = i;
  }
  return calls;
}

/**
 * Blanks out line (`// …`) and block (`/* … *​/`) comments by replacing every
 * comment character with a space — length-preserving so positional indices into
 * the original text stay valid. Prevents a FALSE NEGATIVE where an
 * `isAuthenticated` that lives ONLY inside a comment WITHIN the mount args (a
 * commented-out / TODO middleware, not a real one) is mistaken for a real auth
 * gate. KISS string scan (NOT a full lexer): strings are left intact, which is
 * sufficient — an `isAuthenticated` identifier never appears inside a string in
 * a real middleware chain.
 * @param {string} src
 * @returns {string}
 */
function stripComments(src) {
  const out = src.split('');
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '//') {
      while (i < src.length && src[i] !== '\n') {
        out[i] = ' ';
        i += 1;
      }
    } else if (two === '/*') {
      while (i < src.length && src.slice(i, i + 2) !== '*/') {
        if (src[i] !== '\n') out[i] = ' ';
        i += 1;
      }
      // Blank the closing `*/` too (if present).
      if (i < src.length) {
        out[i] = ' ';
        out[i + 1] = ' ';
        i += 2;
      }
    } else {
      i += 1;
    }
  }
  return out.join('');
}

/**
 * @param {string} args mount-call argument text
 * @returns {boolean} true when `isAuthenticated` appears positionally BEFORE the
 *   first `llmCostGuard` reference (upstream in the middleware chain). Comments
 *   inside the args are stripped first so a commented-out `isAuthenticated` does
 *   NOT satisfy the gate (false negative the W1-C5 edge test pins).
 */
function authUpstreamOfCostGuard(args) {
  const code = stripComments(args);
  const guardIdx = code.indexOf(COST_GUARD_ID);
  if (guardIdx === -1) return true; // no cost guard in this call -> nothing to gate
  const authIdx = code.indexOf(AUTH_ID);
  return authIdx !== -1 && authIdx < guardIdx;
}

function main() {
  const files = collectRouteFiles(ROOT);
  /** @type {string[]} */
  const violations = [];
  let checkedMounts = 0;

  for (const file of files) {
    let src;
    try {
      src = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    // Only files that actually import the cost-guard middleware participate —
    // avoids false positives on a stray `llmCostGuard` token in a comment.
    if (!src.includes(COST_GUARD_ID) || !/llm-cost-guard\.middleware/.test(src)) continue;

    for (const args of extractMountCalls(src)) {
      if (!args.includes(COST_GUARD_ID)) continue;
      checkedMounts += 1;
      if (!authUpstreamOfCostGuard(args)) {
        violations.push(file);
        break; // one report per file is enough
      }
    }
  }

  if (violations.length > 0) {
    console.error(
      `[sentinel:llm-cost-guard-auth] FAIL — ${violations.length} route file(s) mount ` +
        `${COST_GUARD_ID} without ${AUTH_ID} upstream:`,
    );
    for (const f of violations) {
      console.error(`  - ${f}: route mounts ${COST_GUARD_ID} without ${AUTH_ID}`);
    }
    console.error(
      `Every paid-call route must gate ${COST_GUARD_ID} behind ${AUTH_ID} so the per-user ` +
        `daily cap has a stable key. Add ${AUTH_ID} upstream, or extend this sentinel if a new ` +
        `mount pattern is intended.`,
    );
    process.exit(1);
  }

  console.log(
    `[sentinel:llm-cost-guard-auth] PASS — ${files.length} *.route.ts scanned, ` +
      `${checkedMounts} ${COST_GUARD_ID} mount(s) all gated by ${AUTH_ID}.`,
  );
  process.exit(0);
}

main();
