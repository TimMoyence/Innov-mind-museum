import { ESLintUtils, TSESTree } from '@typescript-eslint/utils';

type Options = [
  {
    entities?: string[];
    factoryHints?: Record<string, string>;
    helperPaths?: string[];
    factoryPrefixes?: string[];
  },
];

type MessageIds = 'inlineEntity';

const DEFAULT_ENTITIES = [
  'User',
  'ChatMessage',
  'ChatSession',
  'Review',
  'SupportTicket',
  'MuseumEntity',
  'AuditEvent',
];
const DEFAULT_HELPER_PATHS = ['/tests/helpers/', '/__tests__/helpers/', '/tests/factories/'];
const DEFAULT_FACTORY_HINTS: Record<string, string> = {
  User: 'makeUser() from tests/helpers/auth/user.fixtures.ts',
  ChatMessage: 'makeMessage() from tests/helpers/chat/message.fixtures.ts',
  ChatSession: 'makeSession() from tests/helpers/chat/message.fixtures.ts',
};

const createRule = ESLintUtils.RuleCreator(
  (name) =>
    `https://github.com/innovmind/musaium/blob/main/tools/eslint-plugin-musaium-test-discipline/README.md#${name}`,
);

export default createRule<Options, MessageIds>({
  name: 'no-inline-test-entities',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid inline construction of domain entities in test files; require factories from tests/helpers/.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          entities: { type: 'array', items: { type: 'string' } },
          factoryHints: { type: 'object', additionalProperties: { type: 'string' } },
          helperPaths: { type: 'array', items: { type: 'string' } },
          factoryPrefixes: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      inlineEntity:
        'Use {{factoryHint}} instead of inlining a {{entity}} object literal in a test file. See CLAUDE.md → Test Discipline.',
    },
  },
  defaultOptions: [{}],
  create(context, [opts]) {
    const filename = context.filename ?? context.getFilename?.();
    const entities = opts?.entities ?? DEFAULT_ENTITIES;
    const helperPaths = opts?.helperPaths ?? DEFAULT_HELPER_PATHS;
    const factoryHints = { ...DEFAULT_FACTORY_HINTS, ...(opts?.factoryHints ?? {}) };

    // Skip factory/helper files themselves
    if (helperPaths.some((p) => filename.includes(p))) {
      return {};
    }

    const reportInlineEntity = (
      node: TSESTree.Node,
      entity: string,
    ) => {
      context.report({
        node,
        messageId: 'inlineEntity',
        data: {
          entity,
          factoryHint: factoryHints[entity] ?? `a factory for ${entity}`,
        },
      });
    };

    const typeNameOf = (typeNode: TSESTree.TypeNode | undefined): string | null => {
      if (!typeNode) return null;
      if (typeNode.type === 'TSTypeReference' && typeNode.typeName.type === 'Identifier') {
        return typeNode.typeName.name;
      }
      return null;
    };

    return {
      // pattern A: { ... } as User
      TSAsExpression(node) {
        const name = typeNameOf(node.typeAnnotation);
        if (name && entities.includes(name) && node.expression.type === 'ObjectExpression') {
          reportInlineEntity(node, name);
        }
      },
      // pattern B: <User>{ ... }
      TSTypeAssertion(node) {
        const name = typeNameOf(node.typeAnnotation);
        if (name && entities.includes(name) && node.expression.type === 'ObjectExpression') {
          reportInlineEntity(node, name);
        }
      },
      // pattern C: const u: User = { ...3+ properties... }
      VariableDeclarator(node) {
        if (
          node.init?.type === 'ObjectExpression' &&
          node.init.properties.length >= 3 &&
          node.id.type === 'Identifier' &&
          node.id.typeAnnotation?.typeAnnotation
        ) {
          const name = typeNameOf(node.id.typeAnnotation.typeAnnotation);
          if (name && entities.includes(name)) {
            reportInlineEntity(node.init, name);
          }
        }
      },
    };
  },
});
