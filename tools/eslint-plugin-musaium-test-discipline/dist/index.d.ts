declare const plugin: {
    rules: {
        'no-inline-test-entities': import("@typescript-eslint/utils/dist/ts-eslint").RuleModule<"inlineEntity", [{
            entities?: string[];
            factoryHints?: Record<string, string>;
            helperPaths?: string[];
            detectShapeMatch?: boolean;
            shapeSignatures?: Record<string, string[]>;
        }], unknown, import("@typescript-eslint/utils/dist/ts-eslint").RuleListener> & {
            name: string;
        };
        'no-undisabled-test-discipline-disable': import("@typescript-eslint/utils/dist/ts-eslint").RuleModule<"requireJustification", [], unknown, import("@typescript-eslint/utils/dist/ts-eslint").RuleListener> & {
            name: string;
        };
    };
};
export = plugin;
