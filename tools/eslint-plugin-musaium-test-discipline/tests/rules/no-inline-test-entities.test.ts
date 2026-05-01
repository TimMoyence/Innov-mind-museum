import { RuleTester } from '@typescript-eslint/rule-tester';
import * as parser from '@typescript-eslint/parser';
import rule from '../../src/rules/no-inline-test-entities';

// Wire RuleTester to Jest lifecycle methods
RuleTester.afterAll = (afterAll ?? (() => {})) as never;
RuleTester.it = (it ?? (() => {})) as never;
RuleTester.itOnly = (it.only ?? (() => {})) as never;
RuleTester.describe = (describe ?? (() => {})) as never;

const ruleTester = new RuleTester({
  languageOptions: { parser },
});

ruleTester.run('no-inline-test-entities', rule, {
  valid: [
    { code: 'const u = makeUser();' },
    { code: "const u = makeUser({ email: 'x@y.z' });" },
    { code: "const dto = { id: 1, name: 'x' } as MuseumDirectoryDto;" },
    { code: "const u = { id: 1, name: 'x' };" },
    {
      code: "export function makeUser(): User { return { id: 1, email: 'x', passwordHash: 'h' } as User; }",
      filename: '/repo/tests/helpers/auth/user.fixtures.ts',
    },
    {
      code: "const u = { id: 1, email: 'x' } as User;",
      filename: '/repo/tests/helpers/auth/builder.ts',
    },
    // Shape-match enabled but inside a helper file → exempt
    {
      code: "const u = { id: 1, email: 'x', passwordHash: 'h' };",
      options: [{ detectShapeMatch: true }],
      filename: '/repo/tests/helpers/auth/user.fixtures.ts',
    },
    // Shape-match enabled but the call site is `makeUser({...})` — factory exempt
    {
      code: "const u = makeUser({ id: 1, email: 'x', passwordHash: 'h' });",
      options: [{ detectShapeMatch: true }],
      filename: '/repo/tests/unit/auth/foo.test.ts',
    },
    // Default detectShapeMatch=false; shape-match alone should NOT fire
    {
      code: "const u = { id: 1, email: 'x', passwordHash: 'h' };",
      filename: '/repo/tests/unit/auth/foo.test.ts',
    },
    // Shape-match enabled but only 2 of 3 signature props present
    {
      code: "const u = { id: 1, email: 'x' };",
      options: [{ detectShapeMatch: true }],
      filename: '/repo/tests/unit/auth/foo.test.ts',
    },
  ],
  invalid: [
    {
      code: "const u = { id: 1, email: 'x', passwordHash: 'h' } as User;",
      filename: '/repo/tests/unit/auth/foo.test.ts',
      errors: [{ messageId: 'inlineEntity' }],
    },
    {
      code: "const u: User = { id: 1, email: 'x', passwordHash: 'h', firstname: 'a', lastname: 'b' };",
      filename: '/repo/tests/integration/auth/foo.test.ts',
      errors: [{ messageId: 'inlineEntity' }],
    },
    {
      code: "const u = <User>{ id: 1, email: 'x', passwordHash: 'h' };",
      filename: '/repo/tests/unit/auth/foo.test.ts',
      errors: [{ messageId: 'inlineEntity' }],
    },
    {
      code: "const m = { id: 'x', role: 'user', text: 'hi', sessionId: 's', createdAt: new Date() } as ChatMessage;",
      filename: '/repo/tests/unit/chat/foo.test.ts',
      errors: [{ messageId: 'inlineEntity' }],
    },
    // Shape-match: User signature {id, email, passwordHash} all present, no cast/annotation
    {
      code: "const u = { id: 1, email: 'x', passwordHash: 'h' };",
      options: [{ detectShapeMatch: true }],
      filename: '/repo/tests/unit/auth/foo.test.ts',
      errors: [{ messageId: 'inlineEntity' }],
    },
    // Shape-match: ChatMessage signature {id, sessionId, role, text}
    {
      code: "const m = { id: 'm1', sessionId: 's1', role: 'user', text: 'hi', extra: 'x' };",
      options: [{ detectShapeMatch: true }],
      filename: '/repo/tests/unit/chat/foo.test.ts',
      errors: [{ messageId: 'inlineEntity' }],
    },
    // Shape-match: SupportTicket signature {id, userId, subject, description, status}
    {
      code: "const t = { id: 't1', userId: 1, subject: 's', description: 'd', status: 'open' };",
      options: [{ detectShapeMatch: true }],
      filename: '/repo/tests/unit/support/foo.test.ts',
      errors: [{ messageId: 'inlineEntity' }],
    },
    // Shape-match with custom signature override
    {
      code: "const x = { foo: 1, bar: 2 };",
      options: [{ detectShapeMatch: true, shapeSignatures: { Custom: ['foo', 'bar'] } }],
      filename: '/repo/tests/unit/foo.test.ts',
      errors: [{ messageId: 'inlineEntity' }],
    },
  ],
});
