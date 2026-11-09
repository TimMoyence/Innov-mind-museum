import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BACKEND_ROOT = resolve(__dirname, '../../..');

const TARGETS = [
  'src/modules/chat/adapters/primary/http/explanation.controller.ts',
  'src/modules/chat/adapters/primary/http/routes/chat-session.route.ts',
  'src/modules/chat/adapters/primary/http/routes/chat-media.route.ts',
  'src/modules/chat/adapters/primary/http/routes/chat-memory.route.ts',
] as const;

const INLINE_UNAUTH_THROW_RE =
  /if\s*\(\s*!\s*[A-Za-z_$][\w$]*\?\.id\s*\)\s*\{[\s\S]*?throw\s+new\s+AppError\s*\(\s*\{[\s\S]*?code:\s*['"]UNAUTHORIZED['"][\s\S]*?\}\s*\)\s*;?\s*\}/;

const INLINE_APPERROR_UNAUTHORIZED_RE =
  /throw\s+new\s+AppError\s*\(\s*\{[\s\S]*?code:\s*['"]UNAUTHORIZED['"][\s\S]*?\}\s*\)/;

const REQUIRE_USER_IMPORT_RE =
  /import\s*\{[^}]*\brequireUser\b[^}]*\}\s*from\s*['"]@shared\/http\/requireUser['"]/;

function readTarget(relPath: string): string {
  const abs = resolve(BACKEND_ROOT, relPath);
  return readFileSync(abs, 'utf8');
}

describe('PR-2 codemod — requireUser(req) sentinel (4 files, 7 sites)', () => {
  describe.each(TARGETS)('%s', (relPath) => {
    it('AC4 / R5.1 — does not contain the inline `if (!<user>?.id) { throw new AppError({...UNAUTHORIZED...}) }` pattern', () => {
      const content = readTarget(relPath);
      const match = INLINE_UNAUTH_THROW_RE.exec(content);

      if (match) {
        throw new Error(
          `PR-2 sentinel — ${relPath} still contains the inline 401 duplicate.\n` +
            `Replace with \`const user = requireUser(req);\` (spec §R2, design §3).\n` +
            `First match (offset ${match.index}):\n` +
            `  ${match[0].replace(/\n/g, '\n  ')}`,
        );
      }
      expect(match).toBeNull();
    });

    it("R3.2 — does not contain any inline `throw new AppError({ ... code: 'UNAUTHORIZED' ... })`", () => {
      const content = readTarget(relPath);
      const match = INLINE_APPERROR_UNAUTHORIZED_RE.exec(content);

      if (match) {
        throw new Error(
          `PR-2 sentinel — ${relPath} still throws AppError(UNAUTHORIZED) inline.\n` +
            `Use \`requireUser(req)\` (which delegates to \`unauthorized()\` helper).\n` +
            `First match (offset ${match.index}):\n` +
            `  ${match[0].replace(/\n/g, '\n  ')}`,
        );
      }
      expect(match).toBeNull();
    });

    it('AC1 / R1.1 — imports `requireUser` from `@shared/http/requireUser`', () => {
      const content = readTarget(relPath);

      if (!REQUIRE_USER_IMPORT_RE.test(content)) {
        throw new Error(
          `PR-2 sentinel — ${relPath} is missing the canonical helper import.\n` +
            `Add: \`import { requireUser } from '@shared/http/requireUser';\` (spec §R1).`,
        );
      }
      expect(REQUIRE_USER_IMPORT_RE.test(content)).toBe(true);
    });
  });

  it('sanity — all 7 inline duplicates are covered by the 4 target files at HEAD (red invariant)', () => {
    const globalRe = new RegExp(INLINE_UNAUTH_THROW_RE.source, 'g');
    let total = 0;
    for (const relPath of TARGETS) {
      const content = readTarget(relPath);
      const matches = content.match(globalRe);
      total += matches ? matches.length : 0;
    }

    expect(total).toBeLessThanOrEqual(7);
  });
});
