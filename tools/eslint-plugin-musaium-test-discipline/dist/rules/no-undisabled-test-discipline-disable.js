"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/.pnpm/@typescript-eslint+utils@8.59.1_eslint@10.2.1_typescript@5.9.3/node_modules/@typescript-eslint/utils/dist/eslint-utils/deepMerge.js
var require_deepMerge = __commonJS({
  "node_modules/.pnpm/@typescript-eslint+utils@8.59.1_eslint@10.2.1_typescript@5.9.3/node_modules/@typescript-eslint/utils/dist/eslint-utils/deepMerge.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.isObjectNotArray = isObjectNotArray;
    exports2.deepMerge = deepMerge;
    function isObjectNotArray(obj) {
      return typeof obj === "object" && obj != null && !Array.isArray(obj);
    }
    function deepMerge(first = {}, second = {}) {
      const keys = /* @__PURE__ */ new Set([...Object.keys(first), ...Object.keys(second)]);
      return Object.fromEntries([...keys].map((key) => {
        const firstHasKey = key in first;
        const secondHasKey = key in second;
        const firstValue = first[key];
        const secondValue = second[key];
        let value;
        if (firstHasKey && secondHasKey) {
          if (isObjectNotArray(firstValue) && isObjectNotArray(secondValue)) {
            value = deepMerge(firstValue, secondValue);
          } else {
            value = secondValue;
          }
        } else if (firstHasKey) {
          value = firstValue;
        } else {
          value = secondValue;
        }
        return [key, value];
      }));
    }
  }
});

// node_modules/.pnpm/@typescript-eslint+utils@8.59.1_eslint@10.2.1_typescript@5.9.3/node_modules/@typescript-eslint/utils/dist/eslint-utils/applyDefault.js
var require_applyDefault = __commonJS({
  "node_modules/.pnpm/@typescript-eslint+utils@8.59.1_eslint@10.2.1_typescript@5.9.3/node_modules/@typescript-eslint/utils/dist/eslint-utils/applyDefault.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.applyDefault = applyDefault;
    var deepMerge_1 = require_deepMerge();
    function applyDefault(defaultOptions, userOptions) {
      const options = structuredClone(defaultOptions);
      if (userOptions == null) {
        return options;
      }
      options.forEach((opt, i) => {
        if (userOptions[i] !== void 0) {
          const userOpt = userOptions[i];
          if ((0, deepMerge_1.isObjectNotArray)(userOpt) && (0, deepMerge_1.isObjectNotArray)(opt)) {
            options[i] = (0, deepMerge_1.deepMerge)(opt, userOpt);
          } else {
            options[i] = userOpt;
          }
        }
      });
      return options;
    }
  }
});

// node_modules/.pnpm/@typescript-eslint+utils@8.59.1_eslint@10.2.1_typescript@5.9.3/node_modules/@typescript-eslint/utils/dist/eslint-utils/parserSeemsToBeTSESLint.js
var require_parserSeemsToBeTSESLint = __commonJS({
  "node_modules/.pnpm/@typescript-eslint+utils@8.59.1_eslint@10.2.1_typescript@5.9.3/node_modules/@typescript-eslint/utils/dist/eslint-utils/parserSeemsToBeTSESLint.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.parserSeemsToBeTSESLint = parserSeemsToBeTSESLint;
    function parserSeemsToBeTSESLint(parser) {
      return !!parser && /(?:typescript-eslint|\.\.)[\w/\\]*parser/.test(parser);
    }
  }
});

// node_modules/.pnpm/@typescript-eslint+utils@8.59.1_eslint@10.2.1_typescript@5.9.3/node_modules/@typescript-eslint/utils/dist/eslint-utils/getParserServices.js
var require_getParserServices = __commonJS({
  "node_modules/.pnpm/@typescript-eslint+utils@8.59.1_eslint@10.2.1_typescript@5.9.3/node_modules/@typescript-eslint/utils/dist/eslint-utils/getParserServices.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.getParserServices = getParserServices;
    var parserSeemsToBeTSESLint_1 = require_parserSeemsToBeTSESLint();
    var ERROR_MESSAGE_REQUIRES_PARSER_SERVICES = "You have used a rule which requires type information, but don't have parserOptions set to generate type information for this file. See https://tseslint.com/typed-linting for enabling linting with type information.";
    var ERROR_MESSAGE_UNKNOWN_PARSER = 'Note: detected a parser other than @typescript-eslint/parser. Make sure the parser is configured to forward "parserOptions.project" to @typescript-eslint/parser.';
    function getParserServices(context, allowWithoutFullTypeInformation = false) {
      const parser = (
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- For compatibility with ESLint 8
        context.parserPath || context.languageOptions.parser?.meta?.name
      );
      if (context.sourceCode.parserServices?.esTreeNodeToTSNodeMap == null || context.sourceCode.parserServices.tsNodeToESTreeNodeMap == null) {
        throwError(parser);
      }
      if (context.sourceCode.parserServices.program == null && !allowWithoutFullTypeInformation) {
        throwError(parser);
      }
      return context.sourceCode.parserServices;
    }
    function throwError(parser) {
      const messages = [
        ERROR_MESSAGE_REQUIRES_PARSER_SERVICES,
        `Parser: ${parser || "(unknown)"}`,
        !(0, parserSeemsToBeTSESLint_1.parserSeemsToBeTSESLint)(parser) && ERROR_MESSAGE_UNKNOWN_PARSER
      ].filter(Boolean);
      throw new Error(messages.join("\n"));
    }
  }
});

// node_modules/.pnpm/@typescript-eslint+utils@8.59.1_eslint@10.2.1_typescript@5.9.3/node_modules/@typescript-eslint/utils/dist/eslint-utils/InferTypesFromRule.js
var require_InferTypesFromRule = __commonJS({
  "node_modules/.pnpm/@typescript-eslint+utils@8.59.1_eslint@10.2.1_typescript@5.9.3/node_modules/@typescript-eslint/utils/dist/eslint-utils/InferTypesFromRule.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
  }
});

// node_modules/.pnpm/@typescript-eslint+utils@8.59.1_eslint@10.2.1_typescript@5.9.3/node_modules/@typescript-eslint/utils/dist/eslint-utils/nullThrows.js
var require_nullThrows = __commonJS({
  "node_modules/.pnpm/@typescript-eslint+utils@8.59.1_eslint@10.2.1_typescript@5.9.3/node_modules/@typescript-eslint/utils/dist/eslint-utils/nullThrows.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.NullThrowsReasons = void 0;
    exports2.nullThrows = nullThrows;
    exports2.NullThrowsReasons = {
      MissingParent: "Expected node to have a parent.",
      MissingToken: (token, thing) => `Expected to find a ${token} for the ${thing}.`
    };
    function nullThrows(value, message) {
      if (value == null) {
        throw new Error(`Non-null Assertion Failed: ${message}`);
      }
      return value;
    }
  }
});

// node_modules/.pnpm/@typescript-eslint+utils@8.59.1_eslint@10.2.1_typescript@5.9.3/node_modules/@typescript-eslint/utils/dist/eslint-utils/RuleCreator.js
var require_RuleCreator = __commonJS({
  "node_modules/.pnpm/@typescript-eslint+utils@8.59.1_eslint@10.2.1_typescript@5.9.3/node_modules/@typescript-eslint/utils/dist/eslint-utils/RuleCreator.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.RuleCreator = RuleCreator2;
    var applyDefault_1 = require_applyDefault();
    function RuleCreator2(urlCreator) {
      return function createNamedRule({ meta, name, ...rule }) {
        const ruleWithDocs = createRule2({
          meta: {
            ...meta,
            docs: {
              ...meta.docs,
              url: urlCreator(name)
            }
          },
          name,
          ...rule
        });
        return ruleWithDocs;
      };
    }
    function createRule2({
      create,
      // Keep accepting deprecated defaultOptions for backward compatibility.
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      defaultOptions,
      meta,
      name
    }) {
      const resolvedDefaultOptions = meta.defaultOptions ?? defaultOptions ?? [];
      return {
        create(context) {
          const optionsWithDefault = (0, applyDefault_1.applyDefault)(resolvedDefaultOptions, context.options);
          return create(context, optionsWithDefault);
        },
        defaultOptions,
        meta,
        name
      };
    }
    RuleCreator2.withoutDocs = function withoutDocs(args) {
      return createRule2(args);
    };
  }
});

// node_modules/.pnpm/@typescript-eslint+utils@8.59.1_eslint@10.2.1_typescript@5.9.3/node_modules/@typescript-eslint/utils/dist/eslint-utils/index.js
var require_eslint_utils = __commonJS({
  "node_modules/.pnpm/@typescript-eslint+utils@8.59.1_eslint@10.2.1_typescript@5.9.3/node_modules/@typescript-eslint/utils/dist/eslint-utils/index.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __exportStar = exports2 && exports2.__exportStar || function(m, exports3) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports3, p)) __createBinding(exports3, m, p);
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    __exportStar(require_applyDefault(), exports2);
    __exportStar(require_deepMerge(), exports2);
    __exportStar(require_getParserServices(), exports2);
    __exportStar(require_InferTypesFromRule(), exports2);
    __exportStar(require_nullThrows(), exports2);
    __exportStar(require_RuleCreator(), exports2);
  }
});

// src/rules/no-undisabled-test-discipline-disable.ts
var no_undisabled_test_discipline_disable_exports = {};
__export(no_undisabled_test_discipline_disable_exports, {
  default: () => no_undisabled_test_discipline_disable_default
});
module.exports = __toCommonJS(no_undisabled_test_discipline_disable_exports);
var import_eslint_utils = __toESM(require_eslint_utils());
var AST_TOKEN_TYPES = {
  Line: "Line",
  Block: "Block"
};
var TARGET_PLUGIN = "musaium-test-discipline";
var TARGET_RULES = [
  "musaium-test-discipline/no-inline-test-entities",
  "musaium-test-discipline/no-undisabled-test-discipline-disable"
];
var createRule = (0, import_eslint_utils.RuleCreator)(
  (name) => `https://github.com/innovmind/musaium/blob/main/tools/eslint-plugin-musaium-test-discipline/README.md#${name}`
);
var no_undisabled_test_discipline_disable_default = createRule({
  name: "no-undisabled-test-discipline-disable",
  meta: {
    type: "problem",
    docs: {
      description: 'Disabling musaium-test-discipline rules requires both a "Justification:" reason and "Approved-by:" attestation in the comment body.'
    },
    schema: [],
    messages: {
      requireJustification: 'Disabling a musaium-test-discipline rule requires "Justification: <reason>" AND "Approved-by: <reviewer>" in the same comment. Per CLAUDE.md ESLint discipline.'
    }
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode?.();
    return {
      Program(programNode) {
        const comments = programNode.comments ?? sourceCode.getAllComments();
        for (const comment of comments) {
          if (comment.type !== AST_TOKEN_TYPES.Line && comment.type !== AST_TOKEN_TYPES.Block) {
            continue;
          }
          const value = comment.value.replace(/\s+/g, " ").trim();
          const disableMatch = value.match(
            /^eslint-disable(?:-next-line)?\s+([^\s]+(?:\s*,\s*[^\s]+)*)(?:\s+--\s+(.*))?$/
          );
          if (!disableMatch) continue;
          const rulesText = disableMatch[1];
          const justification = disableMatch[2] ?? "";
          const disabledRules = rulesText.split(",").map((s) => s.trim());
          const targetsOurPlugin = disabledRules.some(
            (r) => TARGET_RULES.includes(r) || r.startsWith(TARGET_PLUGIN + "/")
          );
          if (!targetsOurPlugin) continue;
          const justificationMatch = justification.match(
            /Justification:\s*(.*?)(?:\s+Approved-by:|$)/
          );
          const approvedByMatch = justification.match(/Approved-by:\s*([^\n]*)/);
          const hasJustification = !!justificationMatch && justificationMatch[1].trim().length >= 20;
          const hasApprovedBy = !!approvedByMatch && approvedByMatch[1].trim().length >= 1;
          if (!hasJustification || !hasApprovedBy) {
            context.report({
              node: comment,
              messageId: "requireJustification"
            });
          }
        }
      }
    };
  }
});
