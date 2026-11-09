import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { evaluateGithubCondition } from '../../helpers/workflow/github-condition';

const WORKFLOW = readFileSync(
  resolve(__dirname, '../../../../.github/workflows/ci-cd-backend.yml'),
  'utf8',
);

const job = (name: string): string =>
  WORKFLOW.split(/^(?= {2}[a-z][a-z0-9-]*:$)/m).find((block) => block.startsWith(`  ${name}:`)) ??
  '';

const PROD_VPS = /^ {4}concurrency:\n {6}group: prod-vps\n {6}cancel-in-progress: false$/m;

describe('BACKEND-CONCURRENCY', () => {
  it('BACKEND-CONCURRENCY · un lancement manuel ne partage pas le groupe d’un push sur main', () => {
    const group = /^concurrency:\n {2}group: (.*)$/m.exec(WORKFLOW)?.[1] ?? '';

    expect(group).toContain('${{ github.event_name }}');
  });

  it.each(['deploy-prod', 'rotate-redis-password'])(
    'BACKEND-CONCURRENCY · %s attend son tour sur le VPS sans rien annuler',
    (name) => {
      expect(job(name)).toMatch(PROD_VPS);
    },
  );

  it.each([
    ['refs/heads/main', true, true],
    ['refs/heads/main', false, false],
    ['refs/heads/x', true, false],
  ])(
    'BACKEND-CONCURRENCY · rotation lancée sur %s, case cochée %s : part %s',
    (ref, checked, expected) => {
      const condition = /^ {4}if: (.*)$/m.exec(job('rotate-redis-password'))?.[1] ?? 'false';

      expect(
        evaluateGithubCondition(condition, {
          event: 'workflow_dispatch',
          ref,
          inputs: { rotate_redis_password: checked },
        }),
      ).toBe(expected);
    },
  );
});
