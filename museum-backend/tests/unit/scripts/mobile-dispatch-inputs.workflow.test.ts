import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { evaluateGithubCondition } from '../../helpers/workflow/github-condition';

const WORKFLOW = readFileSync(
  resolve(__dirname, '../../../../.github/workflows/ci-cd-mobile.yml'),
  'utf8',
);

const dispatchBlock = WORKFLOW.slice(
  WORKFLOW.indexOf('  workflow_dispatch:'),
  WORKFLOW.indexOf('\n  pull_request:'),
);

const inputNames = [...dispatchBlock.matchAll(/^ {6}([a-z_]+):$/gm)].map((m) => m[1]);

const profileOptions = [
  ...dispatchBlock.slice(dispatchBlock.indexOf('      profile:')).matchAll(/^ {10}- (\S+)$/gm),
].map((m) => m[1]);

const jobs = WORKFLOW.slice(WORKFLOW.indexOf('\njobs:\n'))
  .split(/^(?= {2}[a-z][a-z0-9-]*:$)/m)
  .slice(1)
  .map((block) => ({ name: block.slice(2, block.indexOf(':')), block }));

const buildJobs = jobs.filter((job) => job.name.startsWith('build-'));

const evaluate = (expression: string, profile: string): boolean =>
  evaluateGithubCondition(expression, { event: 'workflow_dispatch', inputs: { profile } });

const field = (block: string, pattern: RegExp): string => {
  const match = pattern.exec(block);
  if (!match) throw new Error(`champ absent : ${pattern.source}`);
  return match[1];
};

describe('MOBILE-DISPATCH', () => {
  it('MOBILE-DISPATCH · le lancement manuel ne demande que le profil', () => {
    expect(inputNames).toEqual(['profile']);
    expect(profileOptions).toEqual(['preview', 'internal', 'production', 'production-submit']);
  });

  it.each(['preview', 'internal', 'production', 'production-submit'])(
    'MOBILE-DISPATCH · le profil %s lance exactement un build',
    (profile) => {
      const launched = buildJobs.filter((job) =>
        evaluate(field(job.block, /^ {4}if: (.*)$/m), profile),
      );

      expect(launched).toHaveLength(1);
    },
  );

  it('MOBILE-DISPATCH · seul production-submit envoie le build au store', () => {
    const production = buildJobs.find((job) => job.name === 'build-production-android');
    const submit = field(production?.block ?? '', /^ {6}SUBMIT: (.*)$/m);

    expect(profileOptions.filter((profile) => evaluate(submit, profile))).toEqual([
      'production-submit',
    ]);
  });

  it('MOBILE-DISPATCH · aucun build iOS ne part par EAS', () => {
    expect(buildJobs.map((job) => job.name).filter((name) => name.includes('ios'))).toEqual([]);
  });
});
