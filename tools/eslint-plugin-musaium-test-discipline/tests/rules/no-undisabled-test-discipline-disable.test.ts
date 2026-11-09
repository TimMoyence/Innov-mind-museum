import { RuleTester } from '@typescript-eslint/rule-tester';
import * as parser from '@typescript-eslint/parser';
import rule from '../../src/rules/no-undisabled-test-discipline-disable';
import noInlineTestEntities from '../../src/rules/no-inline-test-entities';

const ruleTester = new RuleTester({
  languageOptions: { parser },
  plugins: {
    'musaium-test-discipline': {
      rules: {
        'no-inline-test-entities': noInlineTestEntities,
        'no-undisabled-test-discipline-disable': rule,
      },
    },
  },
  linterOptions: { reportUnusedDisableDirectives: 'off' },
});

ruleTester.run('no-undisabled-test-discipline-disable', rule, {
  valid: [
    { code: '// regular comment without disable\nconst x = 1;' },
    {
      code: '// eslint-disable-next-line musaium-test-discipline/no-inline-test-entities -- Justification: legacy fixture pinned in baseline. Approved-by: tim@2026-04-30\nconst u = { id: 1 } as User;',
    },
    {
      code: '// eslint-disable-next-line no-console\nconsole.log(1);',
    },
  ],
  invalid: [
    {
      code: '// eslint-disable-next-line musaium-test-discipline/no-inline-test-entities\nconst u = { id: 1 } as User;',
      errors: [{ messageId: 'requireJustification' }],
    },
    {
      code: '/* eslint-disable musaium-test-discipline/no-inline-test-entities */ const u = { id: 1 } as User;',
      errors: [{ messageId: 'requireJustification' }],
    },
    {
      code: '// eslint-disable-next-line musaium-test-discipline/no-inline-test-entities -- Justification: missing approver field in this comment\nconst u = { id: 1 } as User;',
      errors: [{ messageId: 'requireJustification' }],
    },
    {
      code: '// eslint-disable-next-line musaium-test-discipline/no-inline-test-entities -- Approved-by: tim, missing justification reason entirely\nconst u = { id: 1 } as User;',
      errors: [{ messageId: 'requireJustification' }],
    },
    {
      code: '/* eslint-disable musaium-test-discipline/no-inline-test-entities\n-- no justification here */ const u = { id: 1 } as User;',
      errors: [{ messageId: 'requireJustification' }],
    },
    {
      code: '// eslint-disable-next-line musaium-test-discipline/no-inline-test-entities -- Justification: ok. Approved-by: tim\nconst u = { id: 1 } as User;',
      errors: [{ messageId: 'requireJustification' }],
    },
  ],
});
