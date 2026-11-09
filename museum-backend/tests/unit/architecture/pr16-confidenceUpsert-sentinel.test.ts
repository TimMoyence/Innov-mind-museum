import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BACKEND_ROOT = resolve(__dirname, '../../..');

const SWEPT_REPOS = [
  'src/modules/knowledge-extraction/adapters/secondary/pg/typeorm-artwork-knowledge.repo.ts',
  'src/modules/knowledge-extraction/adapters/secondary/pg/typeorm-museum-enrichment.repo.ts',
] as const;

const INLINE_CONFIDENCE_BRANCH = /data\.confidence\s*>\s*existing\.confidence/;

const CONFIDENCE_UPSERT_IMPORT =
  /import\s*(?:type\s+)?\{[^}]*\bconfidenceUpsert\b[^}]*\}\s*from\s+['"]@shared\/db\/confidence-upsert['"]/;

function readSource(rel: string): string {
  return readFileSync(resolve(BACKEND_ROOT, rel), 'utf8');
}

function findFirstLineMatch(source: string, rx: RegExp): { line: number; snippet: string } | null {
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (typeof line !== 'string') continue;
    if (rx.test(line)) {
      return { line: i + 1, snippet: line.trim() };
    }
  }
  return null;
}

describe('PR-16 sentinel — swept repos delegate confidence merge to `confidenceUpsert`', () => {
  describe.each(SWEPT_REPOS)('swept repo %s', (rel) => {
    it('does NOT contain the inline `data.confidence > existing.confidence` branch', () => {
      const source = readSource(rel);
      const match = findFirstLineMatch(source, INLINE_CONFIDENCE_BRANCH);
      if (match) {
        throw new Error(
          `PR-16 sweep regression in ${rel}:${match.line}\n` +
            `  forbidden pattern: inline data.confidence > existing.confidence merge branch\n` +
            `  offending line   : ${match.snippet}\n` +
            `  remediation      : delegate to confidenceUpsert per design.md §3`,
        );
      }
      expect(INLINE_CONFIDENCE_BRANCH.test(source)).toBe(false);
    });

    it('imports `confidenceUpsert` from `@shared/db/confidence-upsert`', () => {
      const source = readSource(rel);
      expect(source).toMatch(CONFIDENCE_UPSERT_IMPORT);
    });
  });
});
