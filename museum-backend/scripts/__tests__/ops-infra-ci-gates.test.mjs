// Validation harness for the infra/CI stability run (I-OPS2 / I-OPS3 / I-OPS8).
//
// scripts-esm Jest project (jest.config.ts:166-170, testMatch
// scripts/__tests__/**/*.test.mjs, transform:{}, env node). Pattern mirrors
// stryker-hot-files-gate.test.mjs (@jest/globals + resolve(process.cwd(), ...)).
//
// Repo-root files (infra/, .github/) live ABOVE museum-backend (the jest cwd),
// so they are resolved via resolve(process.cwd(), '..', <repo path>). Verified:
// process.cwd() === <repo>/museum-backend, and '..' === repo root.
//
// NO js-yaml / yaml import (both unresolvable from any app node_modules —
// verified spec §9). This is a constrained line/regex parser over readFileSync.
// It validates the alert rules + AM routing + Dockerfile CMD + the three CI
// gates STRUCTURALLY (no live Prometheus/Alertmanager, no promtool/amtool).
//
// RED contract (UFR-022): every assertion below FAILS today because none of the
// target files/lines exist yet (api-health.yml absent; alertmanager single
// receiver; Dockerfile CMD still migrates; CI still raw-CLI + dispatch-only +
// continue-on-error + no drift gate). The GREEN phase closes the gaps; this file
// is byte-frozen (red-test-manifest.json).

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from '@jest/globals';

// --- Repo-root path resolution (cwd = museum-backend, '..' = repo root) -------
const REPO_ROOT = resolve(process.cwd(), '..');
const repoPath = (rel) => resolve(REPO_ROOT, rel);

const DOCKERFILE_PROD = repoPath('museum-backend/deploy/Dockerfile.prod');
const WF_BACKEND = repoPath('.github/workflows/ci-cd-backend.yml');
const WF_MOBILE = repoPath('.github/workflows/ci-cd-mobile.yml');

// --- WAVE 6 — D5: pgvector image digest pin (deploy + CI) --------------------
const DOCKER_COMPOSE_PROD = repoPath('museum-backend/deploy/docker-compose.prod.yml');

// --- WAVE 2 — observability alert files (M4 KR3 / O1·O5·O6·O7) ---------------

// Read a file or return '' if absent — lets each `it` make its own assertion
// (an absent api-health.yml then fails the content checks, which is the point in
// red). We do NOT throw at module load, so the whole suite reports per-requirement.
function readOrEmpty(absPath) {
  return existsSync(absPath) ? readFileSync(absPath, 'utf8') : '';
}

// --- Sanity: these source files exist (the harness can run at all) -----------
describe('ops-infra-ci-gates :: preconditions', () => {
  it('the workflow + Dockerfile + alertmanager source files exist on disk', () => {
    expect(existsSync(WF_BACKEND)).toBe(true);
    expect(existsSync(WF_MOBILE)).toBe(true);
    expect(existsSync(DOCKERFILE_PROD)).toBe(true);
  });
});

// =============================================================================
// I-OPS3 — single migration path (R6 / R8)
// =============================================================================
describe('I-OPS3 :: single migration path', () => {
  const dockerfile = readOrEmpty(DOCKERFILE_PROD);
  const wf = readOrEmpty(WF_BACKEND);

  it('R6 — Dockerfile.prod CMD no longer runs run-migrations.js at boot', () => {
    // Extract the final CMD line(s). The boot CMD must not reference run-migrations.js.
    const cmdLines = dockerfile
      .split('\n')
      .filter((l) => /^\s*CMD\b/.test(l) || /run-migrations\.js/.test(l));
    // No CMD/ENTRYPOINT line may run the migration script at container boot.
    const bootMigrates = cmdLines.some((l) => /^\s*CMD\b/.test(l) && /run-migrations\.js/.test(l));
    expect(bootMigrates).toBe(false);
    // Defensive: the healthcheck CMD is fine, but the boot CMD must launch the app.
    expect(dockerfile).toMatch(/CMD\s*\[\s*"node"\s*,\s*"dist\/src\/index\.js"\s*\]/);
  });

  it('R6 — every ci-cd-backend.yml deploy job runs the guarded run-migrations.js, NOT the raw typeorm CLI', () => {
    const deployJobs = wf
      .split(/^(?= {2}[a-z][a-z0-9-]*:$)/m)
      .filter((block) => block.startsWith('  deploy-'));
    expect(deployJobs.length).toBeGreaterThan(0);
    for (const job of deployJobs) {
      expect(job).toMatch(/node\s+dist\/src\/data\/db\/run-migrations\.js/);
    }
    expect(wf).not.toMatch(/node\s+\.\/node_modules\/typeorm\/cli\.js\s+migration:run/);
  });
});

// =============================================================================
// I-OPS8 — three real CI gates (R9 / R10 / R11)
// =============================================================================
describe('I-OPS8 :: ai-tests runs on PR (R9)', () => {
  const wf = readOrEmpty(WF_BACKEND);

  it('R9 — ai-tests job if: references changes.outputs.ai and is not dispatch-only', () => {
    // Isolate the ai-tests job block (from its key to the next top-level job key).
    const jobMatch = wf.match(/\n {2}ai-tests:\n([\s\S]*?)(?=\n {2}[A-Za-z0-9_-]+:\n)/);
    expect(jobMatch).not.toBeNull();
    const aiBlock = jobMatch[0];
    // The gating if: must reference the new paths-filter output.
    expect(aiBlock).toMatch(/needs\.changes\.outputs\.ai/);
    // It must NOT be the dispatch-only theatre line.
    const dispatchOnly = /if:\s*github\.event_name\s*==\s*'workflow_dispatch'\s*$/m.test(aiBlock);
    expect(dispatchOnly).toBe(false);
    // The changes job must declare an `ai:` paths filter feeding that output.
    expect(wf).toMatch(/\n\s+ai:\s*\$\{\{\s*steps\.filter\.outputs\.ai\s*\}\}/);
    expect(wf).toMatch(/\n\s+ai:\n(?:\s+(?:-|#).*\n)*\s+- 'museum-backend\/src\/modules\/chat\//);
  });
});

describe('I-OPS8 :: expo-doctor fails the mobile job (R10)', () => {
  const wf = readOrEmpty(WF_MOBILE);

  it('R10 — Expo Doctor step has no continue-on-error: true', () => {
    const lines = wf.split('\n');
    const doctorIdx = lines.findIndex((l) => /expo-doctor/.test(l));
    expect(doctorIdx).toBeGreaterThanOrEqual(0);
    // Scan the few lines belonging to the Expo Doctor step (until the next step `- name:`).
    let stepHasContinueOnError = false;
    for (let i = doctorIdx; i < lines.length; i++) {
      if (i > doctorIdx && /^\s*-\s+name:/.test(lines[i])) break;
      if (/continue-on-error:\s*true/.test(lines[i])) {
        stepHasContinueOnError = true;
        break;
      }
    }
    expect(stepHasContinueOnError).toBe(false);
  });
});

describe('I-OPS8 :: migration-schema-drift gate (R11)', () => {
  const wf = readOrEmpty(WF_BACKEND);

  it('R11 — a migration-drift job exists with the pgvector image and applies all migrations to a clean DB', () => {
    expect(wf).toMatch(/\n {2}migration-drift:\n/);
    // Isolate the migration-drift job block.
    const jobMatch = wf.match(/\n {2}migration-drift:\n([\s\S]*?)(?=\n {2}[A-Za-z0-9_-]+:\n|$)/);
    expect(jobMatch).not.toBeNull();
    const block = jobMatch[0];
    // CLAUDE.md gotcha: clean DB MUST use pgvector image, not postgres:16 (halfvec DDL).
    expect(block).toMatch(/image:\s*pgvector\/pgvector:pg16/);
    // The enforceable gate: every migration applies cleanly, in order, on a pristine
    // pgvector DB (catches the I-OPS3/I-OPS6 broken-migration / missing-halfvec classes).
    expect(block).toMatch(/migration:run/);
    // The generate-a-drift-migration gate is intentionally NOT used: it is
    // structurally infeasible on this schema (the TypeORM schema-diff generator
    // emits ~40 lines of irreducible non-drift it cannot round-trip — halfvec,
    // jsonb defaults, partial/expression indexes, relation-less museum_id FKs).
    // Verified 2026-05-25; documented inline in the workflow + LOT closure report.
    // Assert the COMMAND is absent (prose mentions in comments are fine).
    expect(block).not.toMatch(/run\s+migration:generate/);
  });
});

// =============================================================================
// WAVE 2 — observability alerting (M4 KR3 / O1·O5·O6·O7)
//
// RED contract (UFR-022): A1a, A1b, A1c, A2a, A2b, A2c, A3a, A3b, A5a, A5b
// (10 assertions) FAIL on the current baseline:
//   - llm-cost.yml still selects `circuit_breaker_state == 2` (impossible) on
//     both breaker alerts → A1a/A1b/A1c fail.
//   - infra/grafana/alerting/llm-cost-security.yml does NOT exist → readOrEmpty
//     returns '' and existsSync is false → A2a/A2b/A2c/A3a/A3b fail.
//   - chat-latency.yml / wikidata-resilience.yml headers name only the stale
//     single `telegram-ops` receiver → A5a/A5b fail.
// A1d and A4 are GREEN-time anti-regression guards (may pass today — see notes).
// The GREEN phase fixes the exprs/comment, creates llm-cost-security.yml, and
// reconciles the two stale headers. This file is byte-frozen (red-test-manifest).
// =============================================================================

// =============================================================================
// WAVE 3 — CI gates wired & validated (M4 KR3 / W3-O2·O4·D3·O8)
//
// RED contract (UFR-022): the 4 SUBSTANTIVE assertions FAIL on the current
// baseline (verified by grep on ci-cd-backend.yml — none of the steps exist):
//   - W1a: no `test:scripts` / `--selectProjects scripts-esm` invocation in the
//     quality job (the scripts-esm harness is never run in CI today).
//   - W2a: no `promtool check rules` step over infra/grafana/alerting.
//   - W3a: no `DB_SSL_REJECT_UNAUTHORIZED=false` guard in the workflow.
//   - W4a: the deploy_obs SSH script never references the Telegram bridge
//     secrets before `docker compose up`.
// W1b / W2b / W3b are GREEN-time anti-regression guards — they pass VACUOUSLY
// today (the steps they constrain are absent → isolated block is '' → the
// forbidden patterns are not present). They become load-bearing once GREEN adds
// the steps (same pattern as A1d / A4 in WAVE 2). Documented inline per guard.
//
// All assertions are pure regex over the workflow text (no yaml import) —
// consistent with the constrained line/regex parser contract (header §11-14).
// The GREEN phase wires the four steps; this file is byte-frozen
// (wave3-red-test-manifest.json).
// =============================================================================

// Isolate a single workflow STEP block: from its `- name: <Step>` line up to the
// next `- name:` (or the next job key / EOF). Mirrors the step-isolation note in
// wave3-design.md §4. Returns '' if the named step is absent (→ guards pass
// vacuously, substantive name-presence checks fail — the RED intent).
function stepBlock(text, namePattern) {
  const startRe = new RegExp(`- name: [^\\n]*${namePattern}[^\\n]*\\n`);
  const startMatch = text.match(startRe);
  if (!startMatch) return '';
  const startIdx = startMatch.index + startMatch[0].length;
  const rest = text.slice(startIdx);
  // Stop at the next step (`- name:`) or the next top-level job key.
  const endMatch = rest.match(/\n\s*- name:|\n {2}[A-Za-z0-9_-]+:\n/);
  return rest.slice(0, endMatch ? endMatch.index : rest.length);
}

// --- W1 — O2: scripts-esm harness wired into the quality job -----------------
describe('W3-O2 :: test:scripts (scripts-esm) wired in CI quality job', () => {
  const wf = readOrEmpty(WF_BACKEND);

  it('W1a — quality job invokes `pnpm run test:scripts` (or --selectProjects scripts-esm)', () => {
    // SUBSTANTIVE RED: grep confirms zero occurrence of test:scripts/scripts-esm
    // in ci-cd-backend.yml today → this FAILS until GREEN adds the step.
    expect(wf).toMatch(/run:\s*pnpm run test:scripts|--selectProjects scripts-esm/);
  });

  it('W1b — the test:scripts step is NOT continue-on-error [GREEN-time guard]', () => {
    // GREEN-time guard: vacuously TRUE today (step absent → block ''). Becomes
    // load-bearing once the step exists: forbids a GREEN from shipping the gate
    // as advisory (continue-on-error: true would silence a real failure).
    const block = stepBlock(wf, 'test:scripts');
    expect(block).not.toMatch(/continue-on-error:\s*true/);
  });
});

// --- W3 — D3: DB_SSL_REJECT_UNAUTHORIZED=false warning guard -----------------
describe('W3-D3 :: guard warns on DB_SSL_REJECT_UNAUTHORIZED=false in env files', () => {
  const wf = readOrEmpty(WF_BACKEND);

  it('W3a — workflow greps .env* for DB_SSL_REJECT_UNAUTHORIZED=false and emits ::warning::', () => {
    // SUBSTANTIVE RED: no DB_SSL guard in the workflow today (grep .github/).
    expect(wf).toMatch(/DB_SSL_REJECT_UNAUTHORIZED=false/);
    // The guard must be a WARNING (legitimate for local PgBouncer self-signed),
    // co-located with the grep — assert ::warning:: appears in the same step.
    const block = stepBlock(wf, 'DB_SSL_REJECT_UNAUTHORIZED');
    expect(block).toMatch(/::warning::/);
  });

  it('W3b — DB_SSL guard is a WARNING, never blocking (no exit 1 / ::error::) [GREEN-time guard]', () => {
    // GREEN-time guard: vacuously TRUE today (step absent → block ''). Forbids a
    // GREEN from making the guard blocking — DB_SSL_REJECT_UNAUTHORIZED=false is
    // legitimate for local PgBouncer with self-signed certs (wave3-design.md §2 D3).
    const block = stepBlock(wf, 'DB_SSL_REJECT_UNAUTHORIZED');
    expect(block).not.toMatch(/::error::/);
    expect(block).not.toMatch(/exit 1/);
  });
});

// =============================================================================
// WAVE 4 — bias / LLM-Guard alerts loaded & metric-honest (M4 / AI Act Art.10)
//
// RED contract (UFR-022): B1–B8 FAIL on the current baseline. The dead bias /
// LLM-Guard alert file lives under docs/observability/ (NOT mounted/globbed by
// Prometheus — wave4-design.md §1) and references three metrics that are never
// emitted by prometheus-metrics.ts, plus the label-value `decision="block"`
// which the only call-site (bias-metrics.helper.ts:48 → `blocked`) never emits.
//
// Audit-where-it-is (wave4-design.md §6 Option A): the content checks read the
// file from infra/ if the move happened, ELSE from docs/. Today the file is in
// docs/ and still contains scan_errors_total / scan_attempts_total (B3),
// decision="block" (B4), cost_usd_total (B5), and a header naming no receivers
// (B7) → those content checks FAIL on the REAL stale content (not vacuously on
// an absent file). B1 (file moved into infra/) and B2 (docs source removed) FAIL
// on physical-move grounds. B6 (breaker stays {state="open"} == 1, never == 2)
// and B8 (every alert has a severity label) are GREEN-time guards: the docs/
// content already satisfies them, so they are gated on existsSync(LLM_GUARD_BIAS)
// to FAIL today (the move hasn't happened) and become load-bearing once GREEN
// places the corrected file in infra/. Same `readOrEmpty` + regex contract as
// WAVE 2/3 (no yaml import). This file is byte-frozen (wave4-red-test-manifest).
// =============================================================================

// =============================================================================
// WAVE 6 — D5: pgvector image pinned by digest (deploy + CI)
//
// discovery/deploy-db.md Défaut 5 (LOW): `docker-compose.prod.yml:203` and the
// `migration-drift` job service in `ci-cd-backend.yml:589` reference
// `pgvector/pgvector:pg16` by MUTABLE tag — a `docker compose pull` can swap the
// image with no sha256 validation. The design (wave6-design.md §1 D5) pins the
// multi-arch INDEX digest `sha256:00ba258...` on BOTH files.
//
// RED contract (UFR-022): D5-W6a..c FAIL on the current baseline because both
// files carry the bare `:pg16` tag with NO `@sha256:` digest (verified: compose
// :203 and CI :589). D5-W6d is a GREEN-time guard (vacuous at RED — no digests
// to compare). The GREEN phase appends `@sha256:00ba258...` to both directives.
// This file is byte-frozen (wave6-red-test-manifest.json).
//
// NOTE: existing R11 assertions (`migration-drift` block, lines ~218-236) are
// LEFT UNTOUCHED — this section only ADDS new `it`s. Likewise the W2/W3/W4
// sections above are unchanged.
// =============================================================================

const PGVECTOR_PIN_RE = /image:\s*pgvector\/pgvector:pg16@sha256:[0-9a-f]{64}/;
// Negative lookahead: a `image:` directive pointing at `:pg16` WITHOUT an
// `@sha256:` digest immediately after. Scoped to `image:` so the explanatory
// comment on compose:195 (`# pgvector/pgvector:pg16 — Postgres 16 …`) is NOT a
// false-fail (it's free text, not a directive).
const PGVECTOR_BARE_TAG_RE = /image:\s*pgvector\/pgvector:pg16(?!@sha256:)/;
const PGVECTOR_DIGEST_CAPTURE = /image:\s*pgvector\/pgvector:pg16@sha256:([0-9a-f]{64})/;

describe('WAVE 6 :: D5 — pgvector pinned by digest (deploy prod compose)', () => {
  const compose = readOrEmpty(DOCKER_COMPOSE_PROD);

  it('the prod compose file exists on disk (harness precondition)', () => {
    expect(existsSync(DOCKER_COMPOSE_PROD)).toBe(true);
  });

  it('D5-W6a — the db service pins pgvector by @sha256: digest (64 hex)', () => {
    // FAILS at RED: compose:203 is `image: pgvector/pgvector:pg16` (bare tag).
    expect(compose).toMatch(PGVECTOR_PIN_RE);
  });

  it('D5-W6b — no `image:` directive references pgvector:pg16 without an @sha256 digest', () => {
    // FAILS at RED: the bare-tag directive `image: pgvector/pgvector:pg16` matches.
    expect(compose).not.toMatch(PGVECTOR_BARE_TAG_RE);
  });
});

describe('WAVE 6 :: D5 — pgvector pinned by digest (CI migration-drift)', () => {
  const wf = readOrEmpty(WF_BACKEND);

  it('D5-W6c — the migration-drift job pins pgvector by @sha256: digest (64 hex)', () => {
    // Isolate the migration-drift job block (same pattern as R11 above) so the
    // assertion targets the CI service image, not an unrelated occurrence.
    const jobMatch = wf.match(/\n {2}migration-drift:\n([\s\S]*?)(?=\n {2}[A-Za-z0-9_-]+:\n|$)/);
    expect(jobMatch).not.toBeNull();
    const block = jobMatch[0];
    // FAILS at RED: CI:589 is `image: pgvector/pgvector:pg16` (bare tag).
    expect(block).toMatch(PGVECTOR_PIN_RE);
    expect(block).not.toMatch(PGVECTOR_BARE_TAG_RE);
  });
});

describe('WAVE 6 :: D5 — prod and CI pin the SAME digest (GREEN-time guard)', () => {
  const compose = readOrEmpty(DOCKER_COMPOSE_PROD);
  const wf = readOrEmpty(WF_BACKEND);

  it('D5-W6d — the digest in the prod compose equals the digest in the migration-drift CI job', () => {
    // Vacuous at RED (no digest present → both captures null → both skipped by
    // the guards below). Load-bearing at GREEN: prevents pinning two divergent
    // digests (the CI clean DB must test the SAME image that prod runs).
    const composeDigest = compose.match(PGVECTOR_DIGEST_CAPTURE)?.[1];
    const jobMatch = wf.match(/\n {2}migration-drift:\n([\s\S]*?)(?=\n {2}[A-Za-z0-9_-]+:\n|$)/);
    const ciDigest = jobMatch?.[0].match(PGVECTOR_DIGEST_CAPTURE)?.[1];

    expect(composeDigest).toBeDefined();
    expect(ciDigest).toBeDefined();
    expect(composeDigest).toBe(ciDigest);
  });
});
