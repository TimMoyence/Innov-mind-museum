import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC_ROOT = join(__dirname, '..', '..', '..', 'src');

const CODEMOD_TARGETS = [
  'shared/middleware/authenticated.middleware.ts',
  'modules/auth/useCase/session/token-jwt.service.ts',
  'modules/auth/useCase/session/authSession.service.ts',
  'modules/auth/useCase/session/session-issuer.service.ts',
] as const;

const LOCAL_DEF_RE = /(?:^|\n)\s*(?:export\s+)?(?:const|function)\s+unauthorized\s*[=(]/;
const CANONICAL_IMPORT_RE =
  /from\s+['"](?:@shared\/errors\/app\.error|[./]+(?:shared\/errors\/app\.error|app\.error))['"]/;

describe('PR-1 — `unauthorized()` codemod sentinel', () => {
  describe.each(CODEMOD_TARGETS)('%s', (relPath) => {
    const fullPath = join(SRC_ROOT, relPath);
    const src = readFileSync(fullPath, 'utf8');

    it('defines no local `unauthorized` helper', () => {
      const match = LOCAL_DEF_RE.exec(src);
      expect(match?.[0] ?? null).toBeNull();
    });

    it('imports `unauthorized` from the canonical `@shared/errors/app.error`', () => {
      const importRe = /import\s*\{[^}]*\bunauthorized\b[^}]*\}\s*from\s*['"]([^'"]+)['"]/m;
      const m = importRe.exec(src);
      expect(m).not.toBeNull();
      expect(m?.[0] ?? '').toMatch(CANONICAL_IMPORT_RE);
    });
  });
});
