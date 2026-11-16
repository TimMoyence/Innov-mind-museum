import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from '@jest/globals';

const MOBILE_WORKFLOW = resolve(process.cwd(), '..', '.github/workflows/ci-cd-mobile.yml');
const MAESTRO_LOGS = 'path: museum-frontend/.maestro/logs/';

const steps = readFileSync(MOBILE_WORKFLOW, 'utf8').split(/\n(?= {6}- )/);
const maestroLogUploads = steps.filter(
  (step) => step.includes('actions/upload-artifact@') && step.includes(MAESTRO_LOGS),
);

describe('MAESTRO-SCREENSHOTS', () => {
  it('MAESTRO-SCREENSHOTS · chaque envoi des journaux Maestro garde les captures du dossier caché .maestro', () => {
    expect(maestroLogUploads.length).toBeGreaterThanOrEqual(3);
    expect(
      maestroLogUploads
        .filter((step) => !/^\s+include-hidden-files: true$/m.test(step))
        .map((step) => step.match(/^\s+name: (.+)$/m)?.[1]),
    ).toEqual([]);
  });
});
