import { RuleCreator } from '@typescript-eslint/utils/eslint-utils';
import type { TSESTree } from '@typescript-eslint/utils';

type Options = [
  {
    /** Path globs that opt in. Conservative default: only files containing `repository` in their name. */
    filePathPatterns?: string[];
  },
];

type MessageIds = 'setUndefined' | 'updateUndefined';

const DEFAULT_FILE_PATTERNS = ['.repository.', '.repo.'];

const createRule = RuleCreator(
  (name) =>
    `https://github.com/innovmind/musaium/blob/main/tools/eslint-plugin-musaium-test-discipline/README.md#${name}`,
);

const isUndefinedLiteral = (node: TSESTree.Node | null | undefined): boolean => {
  if (!node) return false;
  return node.type === 'Identifier' && node.name === 'undefined';
};

const propertiesWithUndefined = (
  obj: TSESTree.ObjectExpression,
): TSESTree.Property[] => {
  const offenders: TSESTree.Property[] = [];
  for (const prop of obj.properties) {
    if (prop.type !== 'Property') continue;
    if (prop.shorthand) continue;
    if (prop.computed) continue;
    if (isUndefinedLiteral(prop.value as TSESTree.Node)) {
      offenders.push(prop);
    }
  }
  return offenders;
};

const propertyName = (prop: TSESTree.Property): string => {
  const key = prop.key;
  if (key.type === 'Identifier') return key.name;
  if (key.type === 'Literal' && typeof key.value === 'string') return key.value;
  return '<unknown>';
};

export default createRule<Options, MessageIds>({
  name: 'no-typeorm-set-undefined',
  meta: {
    type: 'problem',
    docs: {
      description:
        "Forbid `field: undefined` in TypeORM `.set()` and `repo.update()` calls — silently skipped, leaves columns unchanged. Use `field: () => 'NULL'` instead.",
    },
    schema: [
      {
        type: 'object',
        properties: {
          filePathPatterns: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      setUndefined:
        '`{{field}}: undefined` in `.set()` is silently skipped by TypeORM (UpdateQueryBuilder filters undefined values before generating SQL). The column will not be cleared — leading to replayable one-time tokens. Use `{{field}}: () => \'NULL\'` instead. See user.repository.pg.ts verifyEmail for reference.',
      updateUndefined:
        '`{{field}}: undefined` in `repo.update()` is silently skipped by TypeORM — `repo.update()` forwards to `.set()` internally. Use `{{field}}: () => \'NULL\'` instead. See user.repository.pg.ts verifyEmail for reference.',
    },
  },
  defaultOptions: [{}],
  create(context, [opts]) {
    const filename = context.filename ?? context.getFilename?.() ?? '';
    const patterns = opts?.filePathPatterns ?? DEFAULT_FILE_PATTERNS;
    if (!patterns.some((p) => filename.includes(p))) {
      return {};
    }

    return {
      // Pattern A: <anything>.set({ field: undefined, ... })
      CallExpression(node) {
        if (node.callee.type !== 'MemberExpression') return;
        const prop = node.callee.property;
        if (prop.type !== 'Identifier') return;

        // Pattern A — .set({...})
        if (prop.name === 'set' && node.arguments.length === 1) {
          const arg = node.arguments[0];
          if (arg?.type === 'ObjectExpression') {
            for (const offender of propertiesWithUndefined(arg)) {
              context.report({
                node: offender,
                messageId: 'setUndefined',
                data: { field: propertyName(offender) },
              });
            }
          }
          return;
        }

        // Pattern B — .update(criteria, { field: undefined, ... })
        // Heuristic: EntityManager / Repository `update` takes (criteria, partial)
        // and forwards to `.set()`. We only flag the 2-arg signature whose
        // second arg is an ObjectExpression — `qb.update(Entity)` only takes one
        // arg and is followed by a separate `.set()` call (covered above).
        if (prop.name === 'update' && node.arguments.length >= 2) {
          const arg = node.arguments[1];
          if (arg?.type === 'ObjectExpression') {
            for (const offender of propertiesWithUndefined(arg)) {
              context.report({
                node: offender,
                messageId: 'updateUndefined',
                data: { field: propertyName(offender) },
              });
            }
          }
        }
      },
    };
  },
});
