/**
 * RED — Cycle C: lock the deploy workflow's ephemeral smoke lifecycle (spec R7).
 *
 * `.github/workflows/ci-cd-backend.yml` today seeds a PERMANENT smoke account on
 * every prod (`:1017-1024`) and staging (`:1595-1599`) deploy via a bare
 * `node dist/scripts/seed-smoke-account.js` (no subcommand). The refactor must:
 *   (a) REMOVE that permanent seed step (no bare `seed-smoke-account.js`
 *       without a `create`/`cleanup` verb),
 *   (b) add a `seed-smoke-account.js create` invocation AND a
 *       `seed-smoke-account.js cleanup` invocation — for BOTH prod and staging,
 *   (c) guarantee `cleanup` runs UNCONDITIONALLY: an `if: ${{ always() }}` step
 *       (or a `trap … EXIT` shell idiom in the same SSH script),
 *   (d) set `SMOKE_ALLOW_REGISTER: 'false'` at the smoke step so a failed
 *       `create` fails loudly instead of self-registering a resident account (D5).
 *
 * No `actionlint` in repo (verified) → a text/parse assertion in Jest is the
 * verification. Fails today: the YAML still has the permanent seed, no
 * create/cleanup verbs, no always()-cleanup, no SMOKE_ALLOW_REGISTER.
 *
 * Run scope:
 *   pnpm jest tests/unit/scripts/ci-cd-backend-smoke-lifecycle.workflow.test.ts
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const WORKFLOW_PATH = path.resolve(__dirname, '../../../../.github/workflows/ci-cd-backend.yml');

const workflow = readFileSync(WORKFLOW_PATH, 'utf8');

/** Count occurrences of a substring (literal). */
const countOccurrences = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

describe('ci-cd-backend.yml — ephemeral smoke lifecycle (R7)', () => {
  it('removes the permanent seed: no bare `seed-smoke-account.js` invocation without a create/cleanup verb', () => {
    // Match every `seed-smoke-account.js` invocation token and inspect the
    // trailing argument on the same line. A bare invocation (no verb) is the
    // permanent-seed anti-pattern we are eliminating.
    const bareInvocations = workflow
      .split('\n')
      .filter((line) => line.includes('seed-smoke-account.js'))
      .filter((line) => !/seed-smoke-account\.js\s+(create|cleanup)\b/.test(line));

    expect(bareInvocations).toEqual([]);
  });

  it('invokes `seed-smoke-account.js create` for both prod and staging deploy', () => {
    // One create per deploy job (prod + staging) = at least 2.
    expect(countOccurrences(workflow, 'seed-smoke-account.js create')).toBeGreaterThanOrEqual(2);
  });

  it('invokes `seed-smoke-account.js cleanup` for both prod and staging deploy', () => {
    expect(countOccurrences(workflow, 'seed-smoke-account.js cleanup')).toBeGreaterThanOrEqual(2);
  });

  it('guards cleanup so it runs unconditionally: an `if: ${{ always() }}` step or a `trap … EXIT` idiom exists', () => {
    const hasAlwaysStep = /if:\s*\$\{\{\s*always\(\)\s*\}\}/.test(workflow);
    // Per-line trap scan avoids cross-line backtracking: a shell `trap … EXIT`.
    const hasExitTrap = workflow
      .split('\n')
      .some((line) => line.includes('trap ') && /\bEXIT\b/.test(line));
    expect(hasAlwaysStep || hasExitTrap).toBe(true);
  });

  it('sets SMOKE_ALLOW_REGISTER=false at the smoke step so a failed create cannot self-heal a resident account (D5)', () => {
    expect(/SMOKE_ALLOW_REGISTER:\s*['"]?false['"]?/.test(workflow)).toBe(true);
  });
});
