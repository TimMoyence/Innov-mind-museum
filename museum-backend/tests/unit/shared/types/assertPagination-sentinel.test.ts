import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../../../../');
const SRC_ROOT = resolve(REPO_ROOT, 'src');
const HELPER_FILE = resolve(SRC_ROOT, 'shared/types/pagination.ts');

const SEVEN_USECASES: readonly string[] = [
  'src/modules/admin/useCase/users/listUsers.useCase.ts',
  'src/modules/admin/useCase/reports/listReports.useCase.ts',
  'src/modules/admin/useCase/audit/listAuditLogs.useCase.ts',
  'src/modules/support/useCase/ticket-user/listUserTickets.useCase.ts',
  'src/modules/support/useCase/ticket-admin/listAllTickets.useCase.ts',
  'src/modules/review/useCase/admin/listAllReviews.useCase.ts',
  'src/modules/review/useCase/public/listApprovedReviews.useCase.ts',
];

function collectTsFiles(dir: string): string[] {
  const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs');
  const out: string[] = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = resolve(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (st.isFile() && full.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('assertPagination sentinel — wire-format string uniqueness in src', () => {
  it('the literal "page must be a positive integer" appears in exactly one src file (the helper)', () => {
    const allTs = collectTsFiles(SRC_ROOT);
    const hits = allTs.filter((path) => {
      const content = readFileSync(path, 'utf8');
      return content.includes('page must be a positive integer');
    });

    expect(hits).toEqual([HELPER_FILE]);
  });

  it('the fixed part "limit must be between 1 and " appears in exactly one src file (the helper)', () => {
    const allTs = collectTsFiles(SRC_ROOT);
    const hits = allTs.filter((path) => {
      const content = readFileSync(path, 'utf8');
      return content.includes('limit must be between 1 and ');
    });

    expect(hits).toEqual([HELPER_FILE]);
  });
});

describe('assertPagination sentinel — 7 useCases import the helper', () => {
  it.each(SEVEN_USECASES)(
    '%s imports assertPagination from @shared/types/pagination',
    (relPath) => {
      const absPath = resolve(REPO_ROOT, relPath);
      const content = readFileSync(absPath, 'utf8');

      expect(content).toMatch(/\bassertPagination\b/);

      const importsHelper =
        /import\s*\{[^}]*\bassertPagination\b[^}]*\}\s*from\s*['"]@shared\/types\/pagination['"]/m.test(
          content,
        ) ||
        /import\s*\{[^}]*\bassertPagination\b[^}]*\}\s*from\s*['"][^'"]*shared\/types\/pagination['"]/m.test(
          content,
        );

      expect(importsHelper).toBe(true);
    },
  );

  it.each(SEVEN_USECASES)(
    '%s no longer contains the inline pattern `!Number.isInteger(...) || ... < 1` paired with badRequest pagination strings',
    (relPath) => {
      const absPath = resolve(REPO_ROOT, relPath);
      const content = readFileSync(absPath, 'utf8');

      expect(content).not.toMatch(/!Number\.isInteger\([^)]+\)\s*\|\|\s*[^|]+<\s*1/);

      expect(content).not.toContain('page must be a positive integer');
      expect(content).not.toContain('limit must be between 1 and ');
    },
  );
});
