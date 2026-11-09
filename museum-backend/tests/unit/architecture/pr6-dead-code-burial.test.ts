import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const BACKEND_ROOT = path.resolve(__dirname, '../../..');
const SRC_DIR = path.join(BACKEND_ROOT, 'src');

const DEAD_SRC_FILES: readonly string[] = [
  path.join(BACKEND_ROOT, 'src/shared/http/http-cache-headers.ts'),
  path.join(BACKEND_ROOT, 'src/shared/audit/audit-chain-verifier.ts'),
];

const DEAD_TEST_FILES: readonly string[] = [
  path.join(BACKEND_ROOT, 'tests/unit/helpers/http-cache-headers.test.ts'),
  path.join(BACKEND_ROOT, 'tests/unit/shared/audit/audit-chain-verifier.test.ts'),
];

const FORBIDDEN_IMPORT_SLUGS: readonly string[] = ['http-cache-headers', 'audit-chain-verifier'];

function grepSrc(pattern: string): string[] {
  let stdout: string;
  try {
    stdout = execSync(
      `grep -rn --include='*.ts' ${JSON.stringify(pattern)} ${JSON.stringify(SRC_DIR)}`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 1) return [];
    throw err;
  }
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

describe('PR-6 dead code burial sentinel (UFR-016)', () => {
  describe.each(DEAD_SRC_FILES)('src file is buried: %s', (absPath) => {
    it('does not exist on disk', () => {
      expect({
        file: path.relative(BACKEND_ROOT, absPath),
        exists: existsSync(absPath),
      }).toEqual({
        file: path.relative(BACKEND_ROOT, absPath),
        exists: false,
      });
    });
  });

  describe.each(DEAD_TEST_FILES)('test file is buried: %s', (absPath) => {
    it('does not exist on disk', () => {
      expect({
        file: path.relative(BACKEND_ROOT, absPath),
        exists: existsSync(absPath),
      }).toEqual({
        file: path.relative(BACKEND_ROOT, absPath),
        exists: false,
      });
    });
  });

  describe.each(FORBIDDEN_IMPORT_SLUGS)('no remaining importer in src/ for slug "%s"', (slug) => {
    it('grep -rn returns zero matches under museum-backend/src', () => {
      const hits = grepSrc(slug);
      expect({ slug, hits }).toEqual({ slug, hits: [] });
    });
  });
});
