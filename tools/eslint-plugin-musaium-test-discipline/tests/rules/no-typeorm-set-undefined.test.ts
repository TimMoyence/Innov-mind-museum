import { RuleTester } from '@typescript-eslint/rule-tester';
import * as parser from '@typescript-eslint/parser';
import rule from '../../src/rules/no-typeorm-set-undefined';

RuleTester.afterAll = (afterAll ?? (() => {})) as never;
RuleTester.it = (it ?? (() => {})) as never;
RuleTester.itOnly = (it.only ?? (() => {})) as never;
RuleTester.describe = (describe ?? (() => {})) as never;

const ruleTester = new RuleTester({
  languageOptions: { parser },
});

const REPO_PATH = '/repo/museum-backend/src/modules/auth/adapters/secondary/pg/user.repository.pg.ts';

ruleTester.run('no-typeorm-set-undefined', rule, {
  valid: [
    // Rule scoped to *.repository.* files — this is application code, exempt.
    {
      code: "const x = { field: undefined };",
      filename: '/repo/museum-backend/src/modules/auth/useCase/resetPassword.ts',
    },
    // Repository file but using the fix pattern `() => 'NULL'` — must not flag.
    {
      code: "qb.set({ field: () => 'NULL', other: () => 'NULL' });",
      filename: REPO_PATH,
    },
    // Repository file, repo.update with the fix pattern.
    {
      code: "repo.update(id, { field: () => 'NULL' });",
      filename: REPO_PATH,
    },
    // Nullable param typed `Date | null` — explicit null is fine, never undefined.
    {
      code: "repo.update(id, { mfaEnrollmentDeadline: deadline });",
      filename: REPO_PATH,
    },
    // qb.update(Entity) — single-arg, no ObjectExpression to inspect.
    {
      code: "qb.update(User).set({ field: () => 'NULL' });",
      filename: REPO_PATH,
    },
    // Single-arg .set with no undefined → fine.
    {
      code: "qb.set({ field: 'value', other: 42 });",
      filename: REPO_PATH,
    },
    // Spread + raw expression — no undefined literal anywhere.
    {
      code: "qb.set({ ...partial, field: () => 'NULL' });",
      filename: REPO_PATH,
    },
  ],
  invalid: [
    // Pattern A — qb.set({ ... field: undefined ... }) in repository file.
    {
      code: "qb.set({ password: hash, reset_token: undefined, reset_token_expires: undefined });",
      filename: REPO_PATH,
      errors: [
        { messageId: 'setUndefined', data: { field: 'reset_token' } },
        { messageId: 'setUndefined', data: { field: 'reset_token_expires' } },
      ],
    },
    // Pattern B — repo.update(id, { ... field: undefined ... }).
    {
      code: "repo.update(userId, { password: hash, reset_token: undefined });",
      filename: REPO_PATH,
      errors: [{ messageId: 'updateUndefined', data: { field: 'reset_token' } }],
    },
    // Pattern A — chained createQueryBuilder().update().set({ ... }) — only the
    // .set() call matters.
    {
      code: "repo.createQueryBuilder().update(User).set({ pending_email: undefined, email_change_token: undefined, email_change_token_expiry: undefined });",
      filename: REPO_PATH,
      errors: [
        { messageId: 'setUndefined', data: { field: 'pending_email' } },
        { messageId: 'setUndefined', data: { field: 'email_change_token' } },
        { messageId: 'setUndefined', data: { field: 'email_change_token_expiry' } },
      ],
    },
    // Pattern B with criteria object literal still flags 2nd-arg undefined.
    {
      code: "repo.update({ email }, { reset_token: undefined });",
      filename: REPO_PATH,
      errors: [{ messageId: 'updateUndefined', data: { field: 'reset_token' } }],
    },
    // Rule also fires on .repo. naming convention (broader catch).
    {
      code: "qb.set({ field: undefined });",
      filename: '/repo/museum-backend/src/modules/foo/adapters/secondary/pg/foo.repo.ts',
      errors: [{ messageId: 'setUndefined', data: { field: 'field' } }],
    },
  ],
});
