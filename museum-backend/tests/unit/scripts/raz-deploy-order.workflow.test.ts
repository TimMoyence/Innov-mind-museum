import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WORKFLOW = readFileSync(
  resolve(__dirname, '../../../../.github/workflows/ci-cd-backend.yml'),
  'utf8',
);

const deployProd = WORKFLOW.split(/^(?= {2}[a-z][a-z0-9-]*:$)/m).find((job) =>
  job.startsWith('  deploy-prod:'),
);

const stepIndex = (marker: string): number =>
  (deployProd ?? '').split(/^(?= {6}- )/m).findIndex((step) => step.includes(marker));

describe('RAZ-M2-DEPLOY-ORDER', () => {
  it('RAZ-M2-DEPLOY-ORDER · deploy-prod installe la compose à 4 services avant de relancer le backend', () => {
    const install = stepIndex('name: Install compose on VPS');
    const upBackend = stepIndex('--remove-orphans');

    expect(install).toBeGreaterThan(0);
    expect(upBackend).toBeGreaterThan(0);
    expect(install).toBeLessThan(upBackend);
  });
});
