type Options = [
    {
        /** Path globs that opt in. Conservative default: only files containing `repository` in their name. */
        filePathPatterns?: string[];
    }
];
type MessageIds = 'setUndefined' | 'updateUndefined';
declare const _default: import("@typescript-eslint/utils/eslint-utils").RuleModule<MessageIds, Options, unknown, import("@typescript-eslint/utils/eslint-utils").RuleListener> & {
    name: string;
};
export default _default;
