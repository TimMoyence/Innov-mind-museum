import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import * as ts from 'typescript';

import { REPO_ROOT } from 'tests/helpers/repo/source-comments';

const BUILD = 'design-system/build.ts';
const TS_EMITTERS = new Set([
  'buildReactNativeTS',
  'buildReactNativeFunctional',
  'buildReactNativeSemantic',
  'rnBarrel',
]);
const COMMENT_START = /^\s*(\/\/|\/\*|\*\s|\*$)/;

const emittedComments = (): string[] => {
  const text = readFileSync(resolve(REPO_ROOT, BUILD), 'utf8');
  const file = ts.createSourceFile(BUILD, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found: string[] = [];
  const inspect = (owner: string, node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === 'TS_HEADER') found.push(`${owner} : TS_HEADER`);
    if (
      (ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node)) &&
      COMMENT_START.test(node.text)
    ) {
      found.push(`${owner} : ${node.text}`);
    }
    ts.forEachChild(node, (child) => {
      inspect(owner, child);
    });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name && TS_EMITTERS.has(node.name.text)) {
      inspect(node.name.text, node);
      return;
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      TS_EMITTERS.has(node.name.text)
    ) {
      inspect(node.name.text, node);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
};

describe('RAZ-M3-TOKENS-EMIS', () => {
  it('RAZ-M3-TOKENS-EMIS · le générateur du design system n’écrit aucun commentaire dans les tokens TypeScript du front', () => {
    expect(emittedComments()).toEqual([]);
  });
});
