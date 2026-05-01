import { ESLintUtils, TSESTree } from '@typescript-eslint/utils';

type Options = [
  {
    entities?: string[];
    factoryHints?: Record<string, string>;
    helperPaths?: string[];
    /** Phase 7: enable shape-match detection (default false). */
    detectShapeMatch?: boolean;
    /** Phase 7: per-entity signature for shape-match. */
    shapeSignatures?: Record<string, string[]>;
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

const DEFAULT_SHAPE_SIGNATURES: Record<string, string[]> = {
  User: ['id', 'email', 'passwordHash'],
  ChatMessage: ['id', 'sessionId', 'role', 'text'],
  ChatSession: ['id', 'userId', 'locale', 'museumMode'],
  Review: ['id', 'rating', 'comment'],
  SupportTicket: ['id', 'userId', 'subject', 'description', 'status'],
  MuseumEntity: ['id', 'name', 'city', 'country'],
  AuditEvent: ['id', 'actorId', 'action', 'targetId'],
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
          detectShapeMatch: { type: 'boolean' },
          shapeSignatures: {
            type: 'object',
            additionalProperties: { type: 'array', items: { type: 'string' } },
          },
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
    const detectShapeMatch = opts?.detectShapeMatch ?? false;
    const shapeSignatures = { ...DEFAULT_SHAPE_SIGNATURES, ...(opts?.shapeSignatures ?? {}) };

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

    function objectExpressionPropNames(node: TSESTree.ObjectExpression): Set<string> {
      const names = new Set<string>();
      for (const prop of node.properties) {
        if (prop.type === 'Property' && prop.key.type === 'Identifier') {
          names.add(prop.key.name);
        } else if (
          prop.type === 'Property' &&
          prop.key.type === 'Literal' &&
          typeof prop.key.value === 'string'
        ) {
          names.add(prop.key.value);
        }
      }
      return names;
    }

    function matchingShapeEntity(
      node: TSESTree.ObjectExpression,
      signatures: Record<string, string[]>,
    ): string | null {
      const names = objectExpressionPropNames(node);
      for (const [entity, signature] of Object.entries(signatures)) {
        if (signature.every((p) => names.has(p))) {
          return entity;
        }
      }
      return null;
    }

    function isFactoryCallArgument(node: TSESTree.ObjectExpression): boolean {
      const parent = (node as TSESTree.Node & { parent?: TSESTree.Node }).parent;
      if (parent?.type !== 'CallExpression') return false;
      const callee = (parent as TSESTree.CallExpression).callee;
      if (callee.type === 'Identifier') {
        return /^(make|build|create)[A-Z]/.test(callee.name);
      }
      return false;
    }

    function isAlreadyCoveredByOtherPath(node: TSESTree.ObjectExpression): boolean {
      const parent = (node as TSESTree.Node & { parent?: TSESTree.Node }).parent;
      if (!parent) return false;
      if (parent.type === 'TSAsExpression' || parent.type === 'TSTypeAssertion') return true;
      if (parent.type === 'VariableDeclarator') {
        const decl = parent as TSESTree.VariableDeclarator;
        if (decl.id.type === 'Identifier' && decl.id.typeAnnotation) return true;
      }
      return false;
    }

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
      // pattern D (Phase 7): shape-match — ObjectExpression containing all signature props
      ObjectExpression(node) {
        if (!detectShapeMatch) return;
        if (isFactoryCallArgument(node)) return;
        if (isAlreadyCoveredByOtherPath(node)) return;
        const entity = matchingShapeEntity(node, shapeSignatures);
        if (entity) {
          reportInlineEntity(node, entity);
        }
      },
    };
  },
});
