import { ESLintUtils, TSESTree, AST_TOKEN_TYPES } from '@typescript-eslint/utils';

const TARGET_PLUGIN = 'musaium-test-discipline';
const TARGET_RULES = [
  'musaium-test-discipline/no-inline-test-entities',
  'musaium-test-discipline/no-undisabled-test-discipline-disable',
];

const createRule = ESLintUtils.RuleCreator(
  (name) =>
    `https://github.com/innovmind/musaium/blob/main/tools/eslint-plugin-musaium-test-discipline/README.md#${name}`,
);

type MessageIds = 'requireJustification';

export default createRule<[], MessageIds>({
  name: 'no-undisabled-test-discipline-disable',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disabling musaium-test-discipline rules requires both a "Justification:" reason and "Approved-by:" attestation in the comment body.',
    },
    schema: [],
    messages: {
      requireJustification:
        'Disabling a musaium-test-discipline rule requires "Justification: <reason>" AND "Approved-by: <reviewer>" in the same comment. Per CLAUDE.md ESLint discipline.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode?.();
    return {
      Program(programNode) {
        // Use ast.comments for a deduplicated list (getAllComments can return duplicates
        // when comments are attached to multiple AST nodes as leading/trailing)
        const comments =
          (programNode as unknown as { body: unknown; comments?: TSESTree.Comment[] }).comments ??
          sourceCode.getAllComments();
        for (const comment of comments) {
          if (
            comment.type !== AST_TOKEN_TYPES.Line &&
            comment.type !== AST_TOKEN_TYPES.Block
          ) {
            continue;
          }

          // Normalise to single-line so multiline block comments don't bypass matching
          const value = comment.value.replace(/\s+/g, ' ').trim();

          // Match eslint-disable or eslint-disable-next-line with rule names
          const disableMatch = value.match(
            /^eslint-disable(?:-next-line)?\s+([^\s]+(?:\s*,\s*[^\s]+)*)(?:\s+--\s+(.*))?$/,
          );
          if (!disableMatch) continue;

          const rulesText = disableMatch[1];
          const justification = disableMatch[2] ?? '';

          // Check if any disabled rule targets our plugin
          const disabledRules = rulesText.split(',').map((s) => s.trim());
          const targetsOurPlugin = disabledRules.some(
            (r) => TARGET_RULES.includes(r) || r.startsWith(TARGET_PLUGIN + '/'),
          );
          if (!targetsOurPlugin) continue;

          // Require Justification: with ≥20 chars body (stopped before Approved-by:),
          // and Approved-by: with ≥1 char
          const justificationMatch = justification.match(
            /Justification:\s*(.*?)(?:\s+Approved-by:|$)/,
          );
          const approvedByMatch = justification.match(/Approved-by:\s*([^\n]*)/);
          const hasJustification =
            !!justificationMatch && justificationMatch[1].trim().length >= 20;
          const hasApprovedBy = !!approvedByMatch && approvedByMatch[1].trim().length >= 1;

          if (!hasJustification || !hasApprovedBy) {
            context.report({
              node: comment as unknown as TSESTree.Node,
              messageId: 'requireJustification',
            });
          }
        }
      },
    };
  },
});
