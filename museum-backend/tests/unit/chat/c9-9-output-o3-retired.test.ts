/**
 * C9.9 (2026-05-18) — Sentinel test asserting the OUTPUT O3 art-topic classifier
 * has been retired per UFR-016 "il est mort on l'enterre".
 *
 * After burial:
 *  - `art-topic-classifier.ts` (the class) is deleted.
 *  - `output-classifier.helper.ts` (`runArtTopicClassifier`) is deleted.
 *  - No production source file imports `ArtTopicClassifier`, `isArtRelated`,
 *    or `runArtTopicClassifier`.
 *
 * Defense surface AFTER burial: section prompt (forces art/museum focus) +
 * L3 LLM judge on uncertain inputs (C9.7) + promptfoo CI corpus (≥ 95 %).
 * See ADR-015 amendment 2026-05-18.
 *
 * RED state today: both files exist; grep yields 7+ matches.
 * GREEN state after burial: files gone; grep empty.
 */
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
    // `|| true` makes grep exit 0 even on zero matches; we assert on stdout.
    // -l prints only the filenames (cheap). We then ignore the empty result.
    const out = execSync(
      'grep -rE "ArtTopicClassifier|isArtRelated|runArtTopicClassifier" src || true',
      { cwd: BACKEND_ROOT, encoding: 'utf8' },
    );
    expect(out.trim()).toBe('');
  });

  it('aggregateOutputText remains importable from a non-deleted module', async () => {
    // The helper module that previously hosted both `runArtTopicClassifier`
    // and `aggregateOutputText` is deleted; the aggregator survives in a
    // dedicated module so the keyword-guardrail input-aggregation flow stays
    // intact.
    const aggregator = await import('@modules/chat/useCase/guardrail/eval/output-aggregator');
    expect(typeof aggregator.aggregateOutputText).toBe('function');
  });
});
