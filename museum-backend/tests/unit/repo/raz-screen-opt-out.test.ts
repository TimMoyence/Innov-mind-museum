import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { REPO_ROOT } from 'tests/helpers/repo/source-comments';

const sentinel = readFileSync(
  resolve(REPO_ROOT, 'scripts/sentinels/screen-test-coverage.mjs'),
  'utf8',
);

describe('RAZ-M14-OPT-OUT', () => {
  it('RAZ-M14-OPT-OUT · un écran sort de la couverture par la liste OPT_OUTS de la sentinelle, jamais par un commentaire e2e-skip', () => {
    expect({
      readsComment: sentinel.includes('e2e-skip'),
      declaresList: /^const OPT_OUTS = new Map\(/m.test(sentinel),
      usesList: /OPT_OUTS\.get\(/.test(sentinel),
    }).toEqual({ readsComment: false, declaresList: true, usesList: true });
  });
});
