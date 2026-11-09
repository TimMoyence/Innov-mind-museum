import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BACKEND_ROOT = resolve(__dirname, '../../..');

const SWEPT_FILES: readonly string[] = [
  'src/modules/admin/adapters/secondary/pg/admin.repository.pg.ts',
  'src/modules/review/adapters/secondary/pg/review.repository.pg.ts',
];

describe('PR-8 sentinel — swept repositories use the paginate helper exclusively', () => {
  it.each(SWEPT_FILES)(
    '%s contains NO inline `.getManyAndCount(` call (replaced by paginate(...))',
    (relPath) => {
      const absPath = resolve(BACKEND_ROOT, relPath);
      const content = readFileSync(absPath, 'utf8');

      expect(content).not.toMatch(/\.getManyAndCount\(/);
    },
  );

  it.each(SWEPT_FILES)(
    '%s contains NO inline `.skip(...).take(...).getMany(` chain (S4 convergence)',
    (relPath) => {
      const absPath = resolve(BACKEND_ROOT, relPath);
      const content = readFileSync(absPath, 'utf8');

      expect(content).not.toMatch(/\.skip\([\s\S]*?\.take\([\s\S]*?\.getMany\((?!AndCount)/);
    },
  );

  it.each(SWEPT_FILES)(
    '%s imports `paginate` from `@shared/pagination/offset-paginate`',
    (relPath) => {
      const absPath = resolve(BACKEND_ROOT, relPath);
      const content = readFileSync(absPath, 'utf8');

      expect(content).toMatch(
        /import\s*\{[^}]*\bpaginate\b[^}]*\}\s*from\s*['"]@shared\/pagination\/offset-paginate['"]/,
      );
    },
  );
});
