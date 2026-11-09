import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { REPO_ROOT } from 'tests/helpers/repo/source-comments';

const scripts = (
  JSON.parse(readFileSync(resolve(REPO_ROOT, 'museum-frontend/package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  }
).scripts;

describe('FE-FORMAT-IGNORE', () => {
  it('FE-FORMAT-IGNORE · les scripts de formatage du front lisent .prettierignore, qui protège les sorties du générateur de tokens', () => {
    const bypassing = Object.entries(scripts)
      .filter(([name, command]) => name.startsWith('format') && command.includes('prettier'))
      .filter(([, command]) => command.includes('--ignore-path'))
      .map(([name]) => name);
    expect(bypassing).toEqual([]);
  });
});
