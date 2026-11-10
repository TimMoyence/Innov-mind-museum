import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { evaluateGithubCondition } from '../../helpers/workflow/github-condition';

const concurrencyOf = (file: string): { group?: string; cancel?: string } => {
  const text = readFileSync(resolve(__dirname, '../../../../.github/workflows', file), 'utf8');
  const match = /^concurrency:\n {2}group: (.*)\n {2}cancel-in-progress: (.*)$/m.exec(text);
  return { group: match?.[1], cancel: match?.[2] };
};

describe('WORKFLOW-CONCURRENCY', () => {
  it.each([
    ['ci-cd-mobile.yml', 'ci-cd-mobile-${{ github.ref }}'],
    ['codeql.yml', 'codeql-${{ github.ref }}'],
    ['recall-e2e.yml', 'recall-e2e-${{ github.ref }}'],
  ])(
    'WORKFLOW-CONCURRENCY · %s : un run plus récent annule le précédent sur la même branche',
    (file, group) => {
      expect(concurrencyOf(file)).toEqual({ group, cancel: 'true' });
    },
  );

  it.each(['ci-cd-backend.yml', 'ci-cd-web.yml'])(
    'WORKFLOW-CONCURRENCY · %s : un déploiement ou une rotation en cours n’est jamais coupé, une PR plus récente annule la précédente',
    (file) => {
      const { cancel } = concurrencyOf(file);

      expect(cancel).toBeDefined();
      for (const event of ['push', 'workflow_dispatch']) {
        expect(evaluateGithubCondition(cancel ?? 'true', { event })).toBe(false);
      }
      expect(evaluateGithubCondition(cancel ?? 'false', { event: 'pull_request' })).toBe(true);
    },
  );
});
