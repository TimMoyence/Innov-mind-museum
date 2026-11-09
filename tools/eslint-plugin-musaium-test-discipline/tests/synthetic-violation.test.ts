import { Linter } from 'eslint';
import * as parser from '@typescript-eslint/parser';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import plugin from '../src/index';

describe('synthetic-violation fixture proves the rule fires', () => {
  it('reports exactly 1 musaium-test-discipline/no-inline-test-entities error', () => {
    const linter = new Linter({ configType: 'flat' });
    const fixturePath = resolve(__dirname, 'fixtures/synthetic-violation.fixture.ts');
    const source = readFileSync(fixturePath, 'utf-8');

    const messages = linter.verify(source, [
      {
        languageOptions: { parser },
        plugins: { 'musaium-test-discipline': plugin },
        rules: { 'musaium-test-discipline/no-inline-test-entities': 'error' },
      },
    ]);

    const ourErrors = messages.filter(
      (m) => m.ruleId === 'musaium-test-discipline/no-inline-test-entities',
    );
    expect(ourErrors).toHaveLength(1);
    expect(ourErrors[0].message).toMatch(/makeUser/);
  });
});
