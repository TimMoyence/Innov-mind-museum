import { readFileSync } from 'node:fs';
import path from 'node:path';

const WORKFLOW_PATH = path.resolve(__dirname, '../../../../.github/workflows/ci-cd-backend.yml');

const workflow = readFileSync(WORKFLOW_PATH, 'utf8');

const countOccurrences = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

describe('ci-cd-backend.yml — ephemeral smoke lifecycle (R7)', () => {
  it('removes the permanent seed: no bare `seed-smoke-account.js` invocation without a create/cleanup verb', () => {
    const bareInvocations = workflow
      .split('\n')
      .filter((line) => line.includes('seed-smoke-account.js'))
      .filter((line) => !/seed-smoke-account\.js\s+(create|cleanup)\b/.test(line));

    expect(bareInvocations).toEqual([]);
  });

  it('every deploy job creates then cleans up its ephemeral smoke account', () => {
    const deployJobs = workflow
      .split(/^(?= {2}[a-z][a-z0-9-]*:$)/m)
      .filter((block) => block.startsWith('  deploy-'));

    expect(deployJobs.length).toBeGreaterThan(0);
    for (const job of deployJobs) {
      expect(countOccurrences(job, 'seed-smoke-account.js create')).toBe(1);
      expect(countOccurrences(job, 'seed-smoke-account.js cleanup')).toBe(1);
    }
  });

  it('guards cleanup so it runs unconditionally: an `if: ${{ always() }}` step or a `trap … EXIT` idiom exists', () => {
    const hasAlwaysStep = /if:\s*\$\{\{\s*always\(\)\s*\}\}/.test(workflow);
    const hasExitTrap = workflow
      .split('\n')
      .some((line) => line.includes('trap ') && /\bEXIT\b/.test(line));
    expect(hasAlwaysStep || hasExitTrap).toBe(true);
  });

  it('sets SMOKE_ALLOW_REGISTER=false at the smoke step so a failed create cannot self-heal a resident account (D5)', () => {
    expect(/SMOKE_ALLOW_REGISTER:\s*['"]?false['"]?/.test(workflow)).toBe(true);
  });
});
