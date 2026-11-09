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
    {
      code: "const x = { field: undefined };",
      filename: '/repo/museum-backend/src/modules/auth/useCase/resetPassword.ts',
    },
    {
      code: "qb.set({ field: () => 'NULL', other: () => 'NULL' });",
      filename: REPO_PATH,
    },
    {
      code: "repo.update(id, { field: () => 'NULL' });",
      filename: REPO_PATH,
    },
    {
      code: "repo.update(id, { mfaEnrollmentDeadline: deadline });",
      filename: REPO_PATH,
    },
    {
      code: "qb.update(User).set({ field: () => 'NULL' });",
      filename: REPO_PATH,
    },
    {
      code: "qb.set({ field: 'value', other: 42 });",
      filename: REPO_PATH,
    },
    {
      code: "qb.set({ ...partial, field: () => 'NULL' });",
      filename: REPO_PATH,
    },
  ],
  invalid: [
    {
      code: "qb.set({ password: hash, reset_token: undefined, reset_token_expires: undefined });",
      filename: REPO_PATH,
      errors: [
        { messageId: 'setUndefined', data: { field: 'reset_token' } },
        { messageId: 'setUndefined', data: { field: 'reset_token_expires' } },
      ],
    },
    {
      code: "repo.update(userId, { password: hash, reset_token: undefined });",
      filename: REPO_PATH,
      errors: [{ messageId: 'updateUndefined', data: { field: 'reset_token' } }],
    },
    {
      code: "repo.createQueryBuilder().update(User).set({ pending_email: undefined, email_change_token: undefined, email_change_token_expiry: undefined });",
      filename: REPO_PATH,
      errors: [
        { messageId: 'setUndefined', data: { field: 'pending_email' } },
        { messageId: 'setUndefined', data: { field: 'email_change_token' } },
        { messageId: 'setUndefined', data: { field: 'email_change_token_expiry' } },
      ],
    },
    {
      code: "repo.update({ email }, { reset_token: undefined });",
      filename: REPO_PATH,
      errors: [{ messageId: 'updateUndefined', data: { field: 'reset_token' } }],
    },
    {
      code: "qb.set({ field: undefined });",
      filename: '/repo/museum-backend/src/modules/foo/adapters/secondary/pg/foo.repo.ts',
      errors: [{ messageId: 'setUndefined', data: { field: 'field' } }],
    },
  ],
});
