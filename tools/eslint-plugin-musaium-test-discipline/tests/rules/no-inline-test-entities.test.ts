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
  ],
});
