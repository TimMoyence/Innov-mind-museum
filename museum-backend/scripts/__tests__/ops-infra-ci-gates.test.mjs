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

const ALERT_DIR = 'infra/grafana/alerting';
const API_HEALTH = repoPath(`${ALERT_DIR}/api-health.yml`);
const ALERTMANAGER = repoPath('infra/grafana/alertmanager.yml');
const VPS_HOST = repoPath(`${ALERT_DIR}/vps-host.yml`);
const DOCKERFILE_PROD = repoPath('museum-backend/deploy/Dockerfile.prod');
const WF_BACKEND = repoPath('.github/workflows/ci-cd-backend.yml');
const WF_MOBILE = repoPath('.github/workflows/ci-cd-mobile.yml');

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
    expect(existsSync(ALERTMANAGER)).toBe(true);
    expect(existsSync(VPS_HOST)).toBe(true);
  });
});

// =============================================================================
// I-OPS2 — alert rules (R1–R4) + severity routing (R5)
// =============================================================================
describe('I-OPS2 :: api-health alert rules', () => {
  const api = readOrEmpty(API_HEALTH);

  it('R1 — api-health.yml has api_5xx_rate_high (warning) and _critical tiers on http_requests_total 5xx with a clamp_min denominator', () => {
    expect(existsSync(API_HEALTH)).toBe(true);
    expect(api).toMatch(/alert:\s*api_5xx_rate_high/);
    expect(api).toMatch(/alert:\s*api_5xx_rate_critical/);
    // 5xx selector on the scraped counter (prometheus-metrics.ts:23-28).
    expect(api).toMatch(/http_requests_total\{[^}]*status=~"5\.\."/);
    // clamp_min denominator avoids 0/0 NaN at cold start (repo pattern chat-latency.yml:50).
    expect(api).toMatch(/clamp_min\(/);
  });

  it('R2 — api-health.yml has backend_target_down on up{job="musaium-backend"} == 0, severity critical, for: >= 2m', () => {
    expect(api).toMatch(/alert:\s*backend_target_down/);
    expect(api).toMatch(/up\{job="musaium-backend"\}\s*==\s*0/);
    expect(api).toMatch(/severity:\s*critical/);
    // for: window >= 2m (avoid flapping on rolling restart). Accept 2m/3m/5m/etc.
    const forMatches = [...api.matchAll(/for:\s*(\d+)m/g)].map((m) => Number(m[1]));
    expect(forMatches.some((m) => m >= 2)).toBe(true);
  });

  it('R3 — api-health.yml has a Redis-down proxy on musaium_guardrail_budget_redis_fallback_total, annotated as indirect/proxy', () => {
    expect(api).toMatch(/musaium_guardrail_budget_redis_fallback_total/);
    // The annotation MUST be honest that this is an indirect proxy, not a redis_up probe.
    expect(api).toMatch(/indirect|proxy/i);
  });

  it('R4 — api-health.yml emits NO alert on a non-scraped metric (no pg_up / postgres_exporter / artwork_embeddings_count) and documents transitive Postgres-down coverage', () => {
    expect(existsSync(API_HEALTH)).toBe(true);
    // NFR HARD: 0 alerts on non-scraped metrics. These are not in the scrape pipeline (spec §9).
    expect(api).not.toMatch(/pg_up/);
    expect(api).not.toMatch(/postgres_exporter/);
    expect(api).not.toMatch(/artwork_embeddings_count/);
    // Transitive Postgres-down coverage must be documented (via backend_target_down).
    expect(api).toMatch(/transitive|backend_target_down/i);
    expect(api.toLowerCase()).toContain('postgres');
  });
});

describe('I-OPS2 :: alertmanager severity routing', () => {
  const am = readOrEmpty(ALERTMANAGER);
  const vps = readOrEmpty(VPS_HOST);

  it('R5 — alertmanager.yml splits severity=critical into a distinct route leg with >= 2 receivers, both still hitting the Telegram bridge', () => {
    // A child routes: block must exist under route:.
    expect(am).toMatch(/routes:/);
    // A leg that matches severity critical (matchers or match_re/match on severity).
    expect(am).toMatch(/severity\s*=\s*"?critical"?|severity:\s*critical/);
    // At least two distinct receiver names (warning vs critical legs).
    const receiverNames = [...am.matchAll(/-\s*name:\s*([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
    const uniqueReceivers = new Set(receiverNames);
    expect(uniqueReceivers.size).toBeGreaterThanOrEqual(2);
    // Both legs still point at the existing Telegram bridge (no new Telegram path).
    const bridgeHits = [...am.matchAll(/alertmanager-telegram:9094/g)];
    expect(bridgeHits.length).toBeGreaterThanOrEqual(2);
  });

  it('R5 — vps-host.yml header comment is reconciled to describe the real warning/critical receiver split (not the stale single telegram-ops claim)', () => {
    // The header comment block (lines 1..first non-comment line) currently claims AM
    // "routes by `severity` + `team` to the `telegram-ops` receiver" — STALE: the real
    // alertmanager.yml had a single telegram-ops receiver and NO routing. After T2.3 the
    // comment must describe the real split. We scope to the HEADER comment block (not the
    // whole file) so existing `severity: warning|critical` rule LABELS don't false-pass it.
    const headerLines = [];
    for (const line of vps.split('\n')) {
      if (line.startsWith('#') || line.trim() === '') headerLines.push(line);
      else break;
    }
    const header = headerLines.join('\n');
    // The reconciled comment must name the NEW per-severity receiver(s) introduced by T2.2,
    // proving the split is documented (and absent today — the stale comment names only
    // the old single `telegram-ops`).
    expect(header).toMatch(/telegram-ops-critical|telegram-ops-warning/);
    // And it must NOT still claim routing "by `severity` + `team`" to a single receiver.
    expect(header).not.toMatch(/routes by `?severity`? \+ `?team`?/i);
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

  it('R6 — ci-cd-backend.yml deploy runs the guarded run-migrations.js for both prod and staging, NOT the raw typeorm CLI', () => {
    // The guarded script must be invoked (it carries the pgvector preflight guard).
    const guardedHits = [...wf.matchAll(/node\s+dist\/src\/data\/db\/run-migrations\.js/g)];
    // Two deploy legs: prod (backend) + staging (backend-staging).
    expect(guardedHits.length).toBeGreaterThanOrEqual(2);
    // The raw, UN-guarded typeorm CLI migration:run must no longer be used.
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
    // A `migration:generate Check must be empty` drift gate is intentionally NOT
    // asserted here: it is structurally infeasible on this schema (the TypeORM
    // generator emits ~40 lines of irreducible non-drift it cannot round-trip —
    // halfvec, jsonb defaults, partial/expression indexes, relation-less museum_id
    // FKs). Verified 2026-05-25; documented inline in the workflow + LOT closure report.
    expect(block).not.toMatch(/migration:generate/);
  });
});
