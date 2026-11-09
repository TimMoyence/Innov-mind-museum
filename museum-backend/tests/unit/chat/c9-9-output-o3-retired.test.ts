import { promises as fs } from 'node:fs';
import { execSync } from 'node:child_process';
import * as path from 'node:path';

const BACKEND_ROOT = path.resolve(__dirname, '../../..');

describe('C9.9 — OUTPUT O3 art-topic classifier retired', () => {
  it('source file art-topic-classifier.ts is deleted', async () => {
    const file = path.join(
      BACKEND_ROOT,
      'src/modules/chat/useCase/guardrail/art-topic-classifier.ts',
    );
    await expect(fs.access(file)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('helper file eval/output-classifier.helper.ts is deleted', async () => {
    const file = path.join(
      BACKEND_ROOT,
      'src/modules/chat/useCase/guardrail/eval/output-classifier.helper.ts',
    );
    await expect(fs.access(file)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('no production source file references the burial symbols', () => {
    const out = execSync(
      'grep -rE "ArtTopicClassifier|isArtRelated|runArtTopicClassifier" src || true',
      { cwd: BACKEND_ROOT, encoding: 'utf8' },
    );
    expect(out.trim()).toBe('');
  });

  it('aggregateOutputText remains importable from a non-deleted module', async () => {
    const aggregator = await import('@modules/chat/useCase/guardrail/eval/output-aggregator');
    expect(typeof aggregator.aggregateOutputText).toBe('function');
  });
});
