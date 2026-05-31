#!/usr/bin/env node
// scripts/sentinels/screen-test-coverage.mjs — UFR-021 enforcement
//
// Walks museum-frontend/app/**/*.tsx (Expo Router routes) +
// museum-frontend/features/**/ui/*Screen.tsx, and for each screen verifies
// that at least one museum-frontend/.maestro/*.yaml flow references either:
//   (a) a testID literal declared in the screen source, OR
//   (b) the screen's Expo Router path, OR
//   (c) the screen's component name (matched against `# screen: <Name>` magic
//       comment in flow headers, future-proof).
//
// Opt-out : `// e2e-skip: <reason ≥ 30 chars>` magic comment in first 20
// lines of the screen file.
//
// Baseline : museum-frontend/.maestro/coverage-baseline.json grandfathers
// pre-UFR-021 uncovered screens. New screens MUST NOT be added; removals only.
//
// Flags :
//   (default)   fail on any MISS, exit 1
//   --report    warn-only mode, emit /tmp/screen-coverage-report.json
//   --staged    check only screens in `git diff --cached --name-only`
//   --emit-baseline
//               write current MISS set to coverage-baseline.json (one-time
//               bootstrap, not for routine use)
//
// No external deps — stdlib only (matches the existing sentinel style:
// as-any-ratchet, audit-factory-coverage, workspace-links).
//
// Spec : docs/TESTING_DISCIPLINE_PROPOSAL.md §3.

import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const FE_ROOT = join(REPO_ROOT, 'museum-frontend');
const APP_DIR = join(FE_ROOT, 'app');
const FEATURES_DIR = join(FE_ROOT, 'features');
const MAESTRO_DIR = join(FE_ROOT, '.maestro');
const BASELINE_PATH = join(MAESTRO_DIR, 'coverage-baseline.json');

const FLAGS = new Set(process.argv.slice(2));
const IS_REPORT = FLAGS.has('--report');
const IS_STAGED = FLAGS.has('--staged');
const IS_EMIT_BASELINE = FLAGS.has('--emit-baseline');

const C = process.stdout.isTTY
  ? {
      green: '\x1b[32m',
      red: '\x1b[31m',
      yellow: '\x1b[33m',
      gray: '\x1b[90m',
      bold: '\x1b[1m',
      reset: '\x1b[0m',
    }
  : { green: '', red: '', yellow: '', gray: '', bold: '', reset: '' };

// ────────────────────────────────────────────────────────────────────────
// File discovery
// ────────────────────────────────────────────────────────────────────────

function walkDir(dir, predicate) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_styles')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkDir(full, predicate));
    } else if (predicate(entry.name, full)) {
      out.push(full);
    }
  }
  return out;
}

function isAppScreen(name) {
  if (!name.endsWith('.tsx')) return false;
  if (name.startsWith('_')) return false; // _layout.tsx, _styles/, etc.
  if (name.startsWith('+')) return false; // +not-found.tsx, etc.
  return true;
}

function isFeatureScreen(name) {
  return name.endsWith('Screen.tsx');
}

function findScreens() {
  const appScreens = walkDir(APP_DIR, isAppScreen);
  const featureScreens = walkDir(FEATURES_DIR, isFeatureScreen).filter((p) =>
    p.includes(`${'/'}ui${'/'}`),
  );
  return [...appScreens, ...featureScreens];
}

function findFlows() {
  if (!existsSync(MAESTRO_DIR)) return [];
  const all = readdirSync(MAESTRO_DIR).filter((f) => f.endsWith('.yaml'));
  // Exclude config.yaml + helpers subdir (helpers walked separately if needed)
  return all
    .filter((f) => f !== 'config.yaml')
    .map((f) => join(MAESTRO_DIR, f));
}

// ────────────────────────────────────────────────────────────────────────
// Screen analysis
// ────────────────────────────────────────────────────────────────────────

function deriveRoutePath(absPath) {
  if (!absPath.startsWith(APP_DIR)) return null;
  const rel = relative(APP_DIR, absPath).replace(/\.tsx$/, '');
  if (rel === 'index') return '/';
  // Strip (group) segments and resolve index files
  const parts = rel.split('/').filter((p) => !/^\([^)]+\)$/.test(p));
  // Replace [param] with :param
  const normalized = parts.map((p) => p.replace(/^\[(.+)\]$/, ':$1'));
  const last = normalized[normalized.length - 1];
  if (last === 'index') normalized.pop();
  return '/' + normalized.join('/');
}

function deriveScreenName(absPath) {
  if (!absPath.endsWith('Screen.tsx')) return null;
  const base = absPath.split('/').pop().replace('.tsx', '');
  return base; // e.g. "BiometricLockScreen"
}

function extractTestIds(source) {
  const ids = new Set();
  const re = /testID=["'`]([\w-]+)["'`]/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    ids.add(m[1]);
  }
  return ids;
}

function extractOptOutReason(source) {
  const first20 = source.split('\n').slice(0, 20).join('\n');
  const m = first20.match(/^\s*\/\/\s*e2e-skip:\s*(.+)$/m);
  if (!m) return null;
  const reason = m[1].trim();
  return reason;
}

// ────────────────────────────────────────────────────────────────────────
// Coverage matching
// ────────────────────────────────────────────────────────────────────────

// Strip YAML comments line-by-line so a *commented-out* testID / route never
// counts as real coverage (e.g. `#  10. /(stack)/ticket-detail — SKIPPED`).
// YAML rule honored: `#` starts a comment only at line start or when preceded
// by whitespace, and never inside a single/double-quoted scalar. The `#screen:`
// magic-comment match (case c) deliberately needs the RAW content, so this is
// applied ONLY to the substring matches (cases a + b) via `flow.code`.
function stripYamlComments(content) {
  return content
    .split('\n')
    .map((line) => {
      let inSingle = false;
      let inDouble = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === "'" && !inDouble) inSingle = !inSingle;
        else if (ch === '"' && !inSingle) inDouble = !inDouble;
        else if (ch === '#' && !inSingle && !inDouble && (i === 0 || /\s/.test(line[i - 1]))) {
          return line.slice(0, i);
        }
      }
      return line;
    })
    .join('\n');
}

function buildFlowsCorpus(flowPaths) {
  // Returns Array<{path, name, content, code}>
  //   content = raw file (used by the `# screen:` magic-comment match, case c)
  //   code    = comment-stripped (used by testID + route substring, cases a + b)
  return flowPaths.map((p) => {
    const content = readFileSync(p, 'utf8');
    return {
      path: p,
      name: p.split('/').pop(),
      content,
      code: stripYamlComments(content),
    };
  });
}

function findCoverage(screen, flows) {
  // screen = {path, source, testIds:Set, routePath, screenName}
  const hits = [];
  for (const flow of flows) {
    let matched = false;
    // (a) testID literal substring match (comment-stripped)
    for (const id of screen.testIds) {
      const needle1 = `"${id}"`;
      const needle2 = `'${id}'`;
      if (flow.code.includes(needle1) || flow.code.includes(needle2)) {
        matched = true;
        break;
      }
    }
    // (b) route path substring (comment-stripped, only if not already matched)
    if (!matched && screen.routePath && screen.routePath !== '/') {
      if (flow.code.includes(screen.routePath)) matched = true;
    }
    // (c) screen name magic comment `# screen: <Name>` in header (RAW — it IS a comment)
    if (!matched && screen.screenName) {
      const header = flow.content.split('\n').slice(0, 10).join('\n');
      if (new RegExp(`#\\s*screen:\\s*${screen.screenName}\\b`).test(header)) {
        matched = true;
      }
    }
    if (matched) hits.push(flow.name);
  }
  return hits;
}

// ────────────────────────────────────────────────────────────────────────
// Baseline (grandfathered screens)
// ────────────────────────────────────────────────────────────────────────

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) {
    return { schemaVersion: 1, grandfathered: [] };
  }
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
}

function writeBaseline(misses) {
  const baseline = {
    schemaVersion: 1,
    comment:
      'Screens grandfathered when UFR-021 sentinel was bootstrapped. ' +
      'New screens MUST NOT be added here. Removals only. ' +
      'Audited weekly via `pnpm sentinel:screen-test-coverage --report`.',
    bootstrappedAt: new Date().toISOString().slice(0, 10),
    grandfathered: misses.map((s) => relative(REPO_ROOT, s.path)).sort(),
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
  return baseline;
}

// ────────────────────────────────────────────────────────────────────────
// Staged-files filter (--staged)
// ────────────────────────────────────────────────────────────────────────

function getStagedScreens(allScreens) {
  let staged;
  try {
    staged = execSync('git diff --cached --name-only --diff-filter=ACMR', {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
  const stagedAbs = new Set(staged.map((p) => join(REPO_ROOT, p)));
  return allScreens.filter((p) => stagedAbs.has(p));
}

// ────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────

function main() {
  console.log(`${C.bold}[sentinel:screen-test-coverage]${C.reset} ${IS_REPORT ? '(report mode)' : ''}${IS_STAGED ? ' (staged)' : ''}`);
  let screens = findScreens();
  if (IS_STAGED) {
    screens = getStagedScreens(screens);
    if (screens.length === 0) {
      console.log(`${C.gray}no staged screens, skipping${C.reset}`);
      process.exit(0);
    }
  }
  const flows = buildFlowsCorpus(findFlows());
  const baseline = loadBaseline();
  const grandfatheredSet = new Set(baseline.grandfathered);

  const results = {
    hits: [],
    misses: [],
    optOuts: [],
    grandfathered: [],
  };

  for (const screenPath of screens) {
    const source = readFileSync(screenPath, 'utf8');
    const screen = {
      path: screenPath,
      source,
      testIds: extractTestIds(source),
      routePath: deriveRoutePath(screenPath),
      screenName: deriveScreenName(screenPath),
    };

    const optOutReason = extractOptOutReason(source);
    if (optOutReason !== null) {
      if (optOutReason.length < 30) {
        console.log(
          `${C.red}✗ ${relative(REPO_ROOT, screenPath)} : e2e-skip reason too short (${optOutReason.length} chars, need ≥30)${C.reset}`,
        );
        process.exit(1);
      }
      results.optOuts.push({ path: screenPath, reason: optOutReason });
      continue;
    }

    const hits = findCoverage(screen, flows);
    if (hits.length > 0) {
      results.hits.push({ path: screenPath, flows: hits });
    } else {
      const rel = relative(REPO_ROOT, screenPath);
      if (grandfatheredSet.has(rel)) {
        results.grandfathered.push({ path: screenPath });
      } else {
        results.misses.push({
          path: screenPath,
          testIds: [...screen.testIds],
          routePath: screen.routePath,
          screenName: screen.screenName,
        });
      }
    }
  }

  // ── Emit baseline mode (bootstrap only) ────────────────────────────
  if (IS_EMIT_BASELINE) {
    const all = [...results.misses, ...results.grandfathered];
    const baselineWritten = writeBaseline(all);
    console.log(
      `${C.green}✓ baseline written : ${baselineWritten.grandfathered.length} screen(s) grandfathered${C.reset}`,
    );
    console.log(`   ${BASELINE_PATH}`);
    process.exit(0);
  }

  // ── Report ───────────────────────────────────────────────────────────
  const total = screens.length;
  const covered = results.hits.length;
  const grand = results.grandfathered.length;
  const opted = results.optOuts.length;
  const missed = results.misses.length;

  console.log(`${C.gray}walked ${total} screen(s), ${flows.length} flow(s)${C.reset}`);
  console.log(`  ${C.green}✓ covered      : ${covered}${C.reset}`);
  if (grand) console.log(`  ${C.yellow}∼ grandfathered : ${grand}${C.reset}`);
  if (opted) console.log(`  ${C.gray}- e2e-skip      : ${opted}${C.reset}`);
  if (missed) console.log(`  ${C.red}✗ uncovered    : ${missed}${C.reset}`);

  if (IS_REPORT) {
    const reportPath = '/tmp/screen-coverage-report.json';
    writeFileSync(reportPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      totals: { screens: total, flows: flows.length, covered, grandfathered: grand, optedOut: opted, uncovered: missed },
      hits: results.hits.map((h) => ({ path: relative(REPO_ROOT, h.path), flows: h.flows })),
      grandfathered: results.grandfathered.map((g) => relative(REPO_ROOT, g.path)),
      optOuts: results.optOuts.map((o) => ({ path: relative(REPO_ROOT, o.path), reason: o.reason })),
      misses: results.misses.map((m) => ({
        path: relative(REPO_ROOT, m.path),
        testIds: m.testIds,
        routePath: m.routePath,
        screenName: m.screenName,
      })),
    }, null, 2) + '\n');
    console.log(`${C.gray}report → ${reportPath}${C.reset}`);
    process.exit(0);
  }

  if (missed === 0) {
    process.exit(0);
  }

  console.log('');
  console.log(`${C.red}${C.bold}UFR-021 violation${C.reset} — ${missed} screen(s) lack Maestro coverage :`);
  for (const m of results.misses) {
    const rel = relative(REPO_ROOT, m.path);
    console.log(`  ${C.red}✗${C.reset} ${rel}`);
    if (m.testIds.length) {
      console.log(`     testIDs in source : ${m.testIds.join(', ')}`);
    } else {
      console.log(`     ${C.gray}(no testID literals found — flow can match by route path "${m.routePath}" or add testID first)${C.reset}`);
    }
  }
  console.log('');
  console.log(`Fix : add a flow in museum-frontend/.maestro/ that references one of the testIDs or the route path,`);
  console.log(`      OR add \`// e2e-skip: <reason ≥ 30 chars>\` at the top of the screen source.`);
  console.log(`      See CLAUDE.md § UFR-021 for the doctrine.`);
  process.exit(1);
}

main();
