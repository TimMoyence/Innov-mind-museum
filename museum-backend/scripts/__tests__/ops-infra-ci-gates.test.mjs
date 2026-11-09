import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from '@jest/globals';

const REPO_ROOT = resolve(process.cwd(), '..');
const repoPath = (rel) => resolve(REPO_ROOT, rel);

const DOCKERFILE_PROD = repoPath('museum-backend/deploy/Dockerfile.prod');
const WF_BACKEND = repoPath('.github/workflows/ci-cd-backend.yml');
const WF_MOBILE = repoPath('.github/workflows/ci-cd-mobile.yml');

const DOCKER_COMPOSE_PROD = repoPath('museum-backend/deploy/docker-compose.prod.yml');

function readOrEmpty(absPath) {
  return existsSync(absPath) ? readFileSync(absPath, 'utf8') : '';
}

describe('ops-infra-ci-gates :: preconditions', () => {
  it('the workflow + Dockerfile + alertmanager source files exist on disk', () => {
    expect(existsSync(WF_BACKEND)).toBe(true);
    expect(existsSync(WF_MOBILE)).toBe(true);
    expect(existsSync(DOCKERFILE_PROD)).toBe(true);
  });
});

describe('I-OPS3 :: single migration path', () => {
  const dockerfile = readOrEmpty(DOCKERFILE_PROD);
  const wf = readOrEmpty(WF_BACKEND);

  it('R6 — Dockerfile.prod CMD no longer runs run-migrations.js at boot', () => {
    const cmdLines = dockerfile
      .split('\n')
      .filter((l) => /^\s*CMD\b/.test(l) || /run-migrations\.js/.test(l));
    const bootMigrates = cmdLines.some((l) => /^\s*CMD\b/.test(l) && /run-migrations\.js/.test(l));
    expect(bootMigrates).toBe(false);
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

describe('I-OPS8 :: ai-tests runs on PR (R9)', () => {
  const wf = readOrEmpty(WF_BACKEND);

  it('R9 — ai-tests job if: references changes.outputs.ai and is not dispatch-only', () => {
    const jobMatch = wf.match(/\n {2}ai-tests:\n([\s\S]*?)(?=\n {2}[A-Za-z0-9_-]+:\n)/);
    expect(jobMatch).not.toBeNull();
    const aiBlock = jobMatch[0];
    expect(aiBlock).toMatch(/needs\.changes\.outputs\.ai/);
    const dispatchOnly = /if:\s*github\.event_name\s*==\s*'workflow_dispatch'\s*$/m.test(aiBlock);
    expect(dispatchOnly).toBe(false);
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
    const jobMatch = wf.match(/\n {2}migration-drift:\n([\s\S]*?)(?=\n {2}[A-Za-z0-9_-]+:\n|$)/);
    expect(jobMatch).not.toBeNull();
    const block = jobMatch[0];
    expect(block).toMatch(/image:\s*pgvector\/pgvector:pg16/);
    expect(block).toMatch(/migration:run/);
    expect(block).not.toMatch(/run\s+migration:generate/);
  });
});

function stepBlock(text, namePattern) {
  const startRe = new RegExp(`- name: [^\\n]*${namePattern}[^\\n]*\\n`);
  const startMatch = text.match(startRe);
  if (!startMatch) return '';
  const startIdx = startMatch.index + startMatch[0].length;
  const rest = text.slice(startIdx);
  const endMatch = rest.match(/\n\s*- name:|\n {2}[A-Za-z0-9_-]+:\n/);
  return rest.slice(0, endMatch ? endMatch.index : rest.length);
}

describe('W3-O2 :: test:scripts (scripts-esm) wired in CI quality job', () => {
  const wf = readOrEmpty(WF_BACKEND);

  it('W1a — quality job invokes `pnpm run test:scripts` (or --selectProjects scripts-esm)', () => {
    expect(wf).toMatch(/run:\s*pnpm run test:scripts|--selectProjects scripts-esm/);
  });

  it('W1b — the test:scripts step is NOT continue-on-error [GREEN-time guard]', () => {
    const block = stepBlock(wf, 'test:scripts');
    expect(block).not.toMatch(/continue-on-error:\s*true/);
  });
});

describe('W3-D3 :: guard warns on DB_SSL_REJECT_UNAUTHORIZED=false in env files', () => {
  const wf = readOrEmpty(WF_BACKEND);

  it('W3a — workflow greps .env* for DB_SSL_REJECT_UNAUTHORIZED=false and emits ::warning::', () => {
    expect(wf).toMatch(/DB_SSL_REJECT_UNAUTHORIZED=false/);
    const block = stepBlock(wf, 'DB_SSL_REJECT_UNAUTHORIZED');
    expect(block).toMatch(/::warning::/);
  });

  it('W3b — DB_SSL guard is a WARNING, never blocking (no exit 1 / ::error::) [GREEN-time guard]', () => {
    const block = stepBlock(wf, 'DB_SSL_REJECT_UNAUTHORIZED');
    expect(block).not.toMatch(/::error::/);
    expect(block).not.toMatch(/exit 1/);
  });
});

const PGVECTOR_PIN_RE = /image:\s*pgvector\/pgvector:pg16@sha256:[0-9a-f]{64}/;
const PGVECTOR_BARE_TAG_RE = /image:\s*pgvector\/pgvector:pg16(?!@sha256:)/;
const PGVECTOR_DIGEST_CAPTURE = /image:\s*pgvector\/pgvector:pg16@sha256:([0-9a-f]{64})/;

describe('WAVE 6 :: D5 — pgvector pinned by digest (deploy prod compose)', () => {
  const compose = readOrEmpty(DOCKER_COMPOSE_PROD);

  it('the prod compose file exists on disk (harness precondition)', () => {
    expect(existsSync(DOCKER_COMPOSE_PROD)).toBe(true);
  });

  it('D5-W6a — the db service pins pgvector by @sha256: digest (64 hex)', () => {
    expect(compose).toMatch(PGVECTOR_PIN_RE);
  });

  it('D5-W6b — no `image:` directive references pgvector:pg16 without an @sha256 digest', () => {
    expect(compose).not.toMatch(PGVECTOR_BARE_TAG_RE);
  });
});

describe('WAVE 6 :: D5 — pgvector pinned by digest (CI migration-drift)', () => {
  const wf = readOrEmpty(WF_BACKEND);

  it('D5-W6c — the migration-drift job pins pgvector by @sha256: digest (64 hex)', () => {
    const jobMatch = wf.match(/\n {2}migration-drift:\n([\s\S]*?)(?=\n {2}[A-Za-z0-9_-]+:\n|$)/);
    expect(jobMatch).not.toBeNull();
    const block = jobMatch[0];
    expect(block).toMatch(PGVECTOR_PIN_RE);
    expect(block).not.toMatch(PGVECTOR_BARE_TAG_RE);
  });
});

describe('WAVE 6 :: D5 — prod and CI pin the SAME digest (GREEN-time guard)', () => {
  const compose = readOrEmpty(DOCKER_COMPOSE_PROD);
  const wf = readOrEmpty(WF_BACKEND);

  it('D5-W6d — the digest in the prod compose equals the digest in the migration-drift CI job', () => {
    const composeDigest = compose.match(PGVECTOR_DIGEST_CAPTURE)?.[1];
    const jobMatch = wf.match(/\n {2}migration-drift:\n([\s\S]*?)(?=\n {2}[A-Za-z0-9_-]+:\n|$)/);
    const ciDigest = jobMatch?.[0].match(PGVECTOR_DIGEST_CAPTURE)?.[1];

    expect(composeDigest).toBeDefined();
    expect(ciDigest).toBeDefined();
    expect(composeDigest).toBe(ciDigest);
  });
});
