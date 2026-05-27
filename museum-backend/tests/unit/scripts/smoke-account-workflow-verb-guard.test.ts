/**
 * RED — Cycle C: workflow-wide guard against bare smoke-account invocations.
 *
 * The smoke-account seed script was refactored into `create` / `cleanup`
 * subcommands (dispatch on argv[2]). A bare invocation — `pnpm run
 * seed:smoke-account` or `node .../seed-smoke-account.js` with NO verb — now
 * crashes (unknown/missing subcommand). The `ci-cd-backend.yml` workflow was
 * migrated, but two CI smoke workflows still call the alias verb-less and
 * therefore break:
 *   - `.github/workflows/llm-promptfoo-smoke.yml`   (`run: pnpm run seed:smoke-account`)
 *   - `.github/workflows/llm-security-promptfoo.yml` (`run: pnpm run seed:smoke-account`)
 *
 * This guard scans EVERY `.github/workflows/*.yml` and asserts that every
 * invocation of the smoke-account script — via the `seed:smoke-account` pnpm
 * alias OR a direct `seed-smoke-account.js` / `seed-smoke-account.ts` call — is
 * followed by a `create` or `cleanup` verb. It prevents recurrence in any
 * future workflow, and fails today by listing the two non-compliant files.
 *
 * No `actionlint` in repo → a text/parse assertion in Jest is the verification.
 *
 * Run scope:
 *   pnpm jest tests/unit/scripts/smoke-account-workflow-verb-guard.test.ts
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const WORKFLOWS_DIR = path.resolve(__dirname, '../../../../.github/workflows');

/**
 * An invocation line that *runs* the smoke-account script. Matches the two
 * shapes used in this repo:
 *   - pnpm alias:  `pnpm run seed:smoke-account` / `pnpm seed:smoke-account`
 *   - direct node: `node dist/scripts/seed-smoke-account.js`
 *                  `node scripts/seed-smoke-account.ts`
 * Comment lines (those whose first non-space char is `#`) are excluded so a
 * doc-reference to the script name does not register as an invocation.
 */
const INVOCATION_RE = /(seed:smoke-account|seed-smoke-account\.(?:js|ts))\b/;
const VERB_RE = /(seed:smoke-account|seed-smoke-account\.(?:js|ts))\s+(create|cleanup)\b/;

const isCommentLine = (line: string): boolean => line.trimStart().startsWith('#');

interface BareInvocation {
  file: string;
  line: number;
  text: string;
}

/** Scan one workflow file's lines for bare (verb-less) smoke-account invocations. */
const scanFile = (fileName: string): BareInvocation[] => {
  const fullPath = path.join(WORKFLOWS_DIR, fileName);
  const content = readFileSync(fullPath, 'utf8');
  const bare: BareInvocation[] = [];

  content.split('\n').forEach((rawLine, idx) => {
    if (isCommentLine(rawLine)) return;
    if (!INVOCATION_RE.test(rawLine)) return;
    if (VERB_RE.test(rawLine)) return;
    bare.push({ file: fileName, line: idx + 1, text: rawLine.trim() });
  });

  return bare;
};

describe('smoke-account workflow verb guard', () => {
  const workflowFiles = readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith('.yml'));

  it('finds workflow files to scan', () => {
    expect(workflowFiles.length).toBeGreaterThan(0);
  });

  it('every smoke-account invocation in .github/workflows/*.yml uses a create|cleanup verb', () => {
    const offenders = workflowFiles.flatMap(scanFile);

    // Build human-readable `file:line -> text` strings and assert against [].
    // Jest 29 ignores any 2nd arg to expect(), so we surface the offending
    // files INSIDE the asserted value — the toEqual diff prints each bare
    // invocation, satisfying the "list the offenders" requirement.
    const offenderLines = offenders.map((o) => `${o.file}:${o.line} -> ${o.text}`);

    // Sanity: the script now dispatches on a create|cleanup subcommand, so any
    // bare `seed:smoke-account` / `seed-smoke-account.{js,ts}` invocation
    // crashes. None must remain in any workflow.
    expect(offenderLines).toEqual([]);
  });
});
