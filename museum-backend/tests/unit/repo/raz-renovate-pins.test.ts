import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { REPO_ROOT, hashComments, trackedSources } from 'tests/helpers/repo/source-comments';

const PINNED = /^\s*-?\s*uses:\s*[\w.-]+\/[\w./-]+@[0-9a-f]{40}\b/;
const VERSIONED = /@[0-9a-f]{40}\s+#\s*v?\d[\w.-]*\s*$/;

describe('RAZ-M3-RENOVATE', () => {
  it('RAZ-M3-RENOVATE · le commentaire de version que Renovate écrit après un SHA épinglé est une directive, pas un commentaire', () => {
    const line =
      '      - uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803  # v6.1.0\n';
    expect(hashComments('.github/workflows/x.yml', line)).toEqual([]);
  });

  it('RAZ-M3-RENOVATE · chaque action épinglée par SHA porte le commentaire de version que Renovate relit', () => {
    const unversioned = trackedSources()
      .filter((path) => /\.ya?ml$/.test(path) && path.startsWith('.github/'))
      .flatMap((path) =>
        readFileSync(resolve(REPO_ROOT, path), 'utf8')
          .split('\n')
          .map((line, index) => ({ line, at: `${path}:${String(index + 1)}` }))
          .filter(({ line }) => PINNED.test(line) && !VERSIONED.test(line))
          .map(({ at }) => at),
      );
    expect(unversioned).toEqual([]);
  });
});
