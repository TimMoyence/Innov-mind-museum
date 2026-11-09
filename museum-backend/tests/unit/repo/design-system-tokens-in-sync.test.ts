import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { REPO_ROOT } from 'tests/helpers/repo/source-comments';

describe('DESIGN-SYSTEM-SYNC', () => {
  it('DESIGN-SYSTEM-SYNC · le générateur reproduit chaque fichier de tokens suivi, composants compris', () => {
    const run = spawnSync('node', ['--import', 'tsx', 'build.ts', '--check'], {
      cwd: resolve(REPO_ROOT, 'design-system'),
      encoding: 'utf8',
    });
    expect({ status: run.status, stderr: run.stderr.trim() }).toEqual({ status: 0, stderr: '' });
  });
});
