import { ESLintUtils } from '@typescript-eslint/utils';
type Options = [
    {
        entities?: string[];
        factoryHints?: Record<string, string>;
        helperPaths?: string[];
        /** Phase 7: enable shape-match detection (default false). */
        detectShapeMatch?: boolean;
        /** Phase 7: per-entity signature for shape-match. */
        shapeSignatures?: Record<string, string[]>;
    }
];
declare const _default: ESLintUtils.RuleModule<"inlineEntity", Options, unknown, ESLintUtils.RuleListener> & {
    name: string;
};
export default _default;
