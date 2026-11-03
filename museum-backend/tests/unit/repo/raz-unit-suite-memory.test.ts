import config from '../../../jest.config';
import pkg from '../../../package.json';

describe('RAZ-M17-UNIT-SUITE-MEMORY', () => {
  it('RAZ-M17-UNIT-SUITE-MEMORY · la suite unitaire locale tourne en workers et non dans un seul processus', () => {
    expect(pkg.scripts.test).not.toContain('--runInBand');
    expect(pkg.scripts['test:coverage']).not.toContain('--runInBand');
  });

  it('RAZ-M17-UNIT-SUITE-MEMORY · un worker qui gonfle est recyclé avant la limite du tas', () => {
    expect(config.workerIdleMemoryLimit).toBe('1GB');
  });
});
