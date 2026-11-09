import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BACKEND_ROOT = resolve(__dirname, '../../..');

const TARGETS: readonly string[] = [
  'src/modules/auth/useCase/password/changePassword.useCase.ts',
  'src/modules/auth/useCase/email/changeEmail.useCase.ts',
];

const INLINE_REAUTH_PATTERN = /bcrypt\.compare\s*\(\s*currentPassword\b/;

const SOCIAL_ONLY_LITERAL = /social-only/i;

const ASSERT_PASSWORD_REAUTH_IMPORT =
  /import\s*\{[^}]*\bassertPasswordReauth\b[^}]*\}\s*from\s+['"]@modules\/auth\/useCase\/shared\/assertPasswordReauth['"]/;

function readTarget(relPath: string): string {
  const abs = resolve(BACKEND_ROOT, relPath);
  return readFileSync(abs, 'utf8');
}

describe('PR-9 sentinel — no inline bcrypt.compare(currentPassword, …) in swept useCases', () => {
  it.each(TARGETS)('%s does not contain inline `bcrypt.compare(currentPassword, …)`', (relPath) => {
    const source = readTarget(relPath);
    const match = INLINE_REAUTH_PATTERN.exec(source);
    expect(match).toBeNull();
  });
});

describe('PR-9 sentinel — no inline `social-only` literal in swept useCases', () => {
  it.each(TARGETS)('%s does not contain the literal `social-only`', (relPath) => {
    const source = readTarget(relPath);
    const match = SOCIAL_ONLY_LITERAL.exec(source);
    expect(match).toBeNull();
  });
});

describe('PR-9 sentinel — assertPasswordReauth imported from shared path', () => {
  it.each(TARGETS)(
    '%s imports `assertPasswordReauth` from `@modules/auth/useCase/shared/assertPasswordReauth`',
    (relPath) => {
      const source = readTarget(relPath);
      expect(source).toMatch(ASSERT_PASSWORD_REAUTH_IMPORT);
    },
  );
});
