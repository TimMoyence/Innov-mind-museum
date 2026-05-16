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
    exports2.RuleCreator = RuleCreator4;
    var applyDefault_1 = require_applyDefault();
    function RuleCreator4(urlCreator) {
      return function createNamedRule({ meta, name, ...rule }) {
        const ruleWithDocs = createRule4({
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
    function createRule4({
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
    RuleCreator4.withoutDocs = function withoutDocs(args) {
      return createRule4(args);
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

// src/rules/no-inline-test-entities.ts
var import_eslint_utils = __toESM(require_eslint_utils());
var DEFAULT_ENTITIES = [
  "User",
  "ChatMessage",
  "ChatSession",
  "Review",
  "SupportTicket",
  "MuseumEntity",
  "AuditEvent"
];
var DEFAULT_HELPER_PATHS = ["/tests/helpers/", "/__tests__/helpers/", "/tests/factories/"];
var DEFAULT_FACTORY_HINTS = {
  User: "makeUser() from tests/helpers/auth/user.fixtures.ts",
  ChatMessage: "makeMessage() from tests/helpers/chat/message.fixtures.ts",
  ChatSession: "makeSession() from tests/helpers/chat/message.fixtures.ts"
};
var DEFAULT_SHAPE_SIGNATURES = {
  User: ["id", "email", "passwordHash"],
  ChatMessage: ["id", "sessionId", "role", "text"],
  ChatSession: ["id", "userId", "locale", "museumMode"],
  Review: ["id", "rating", "comment"],
  SupportTicket: ["id", "userId", "subject", "description", "status"],
  MuseumEntity: ["id", "name", "city", "country"],
  AuditEvent: ["id", "actorId", "action", "targetId"]
};
var createRule = (0, import_eslint_utils.RuleCreator)(
  (name) => `https://github.com/innovmind/musaium/blob/main/tools/eslint-plugin-musaium-test-discipline/README.md#${name}`
);
var no_inline_test_entities_default = createRule({
  name: "no-inline-test-entities",
  meta: {
    type: "problem",
    docs: {
      description: "Forbid inline construction of domain entities in test files; require factories from tests/helpers/."
    },
    schema: [
      {
        type: "object",
        properties: {
          entities: { type: "array", items: { type: "string" } },
          factoryHints: { type: "object", additionalProperties: { type: "string" } },
          helperPaths: { type: "array", items: { type: "string" } },
          detectShapeMatch: { type: "boolean" },
          shapeSignatures: {
            type: "object",
            additionalProperties: { type: "array", items: { type: "string" } }
          }
        },
        additionalProperties: false
      }
    ],
    messages: {
      inlineEntity: "Use {{factoryHint}} instead of inlining a {{entity}} object literal in a test file. See CLAUDE.md \u2192 Test Discipline."
    }
  },
  defaultOptions: [{}],
  create(context, [opts]) {
    const filename = context.filename ?? context.getFilename?.();
    const entities = opts?.entities ?? DEFAULT_ENTITIES;
    const helperPaths = opts?.helperPaths ?? DEFAULT_HELPER_PATHS;
    const factoryHints = { ...DEFAULT_FACTORY_HINTS, ...opts?.factoryHints ?? {} };
    const detectShapeMatch = opts?.detectShapeMatch ?? false;
    const shapeSignatures = { ...DEFAULT_SHAPE_SIGNATURES, ...opts?.shapeSignatures ?? {} };
    if (helperPaths.some((p) => filename.includes(p))) {
      return {};
    }
    const reportInlineEntity = (node, entity) => {
      context.report({
        node,
        messageId: "inlineEntity",
        data: {
          entity,
          factoryHint: factoryHints[entity] ?? `a factory for ${entity}`
        }
      });
    };
    const typeNameOf = (typeNode) => {
      if (!typeNode) return null;
      if (typeNode.type === "TSTypeReference" && typeNode.typeName.type === "Identifier") {
        return typeNode.typeName.name;
      }
      return null;
    };
    function objectExpressionPropNames(node) {
      const names = /* @__PURE__ */ new Set();
      for (const prop of node.properties) {
        if (prop.type === "Property" && prop.key.type === "Identifier") {
          names.add(prop.key.name);
        } else if (prop.type === "Property" && prop.key.type === "Literal" && typeof prop.key.value === "string") {
          names.add(prop.key.value);
        }
      }
      return names;
    }
    function matchingShapeEntity(node, signatures) {
      const names = objectExpressionPropNames(node);
      for (const [entity, signature] of Object.entries(signatures)) {
        if (signature.every((p) => names.has(p))) {
          return entity;
        }
      }
      return null;
    }
    function isFactoryCallArgument(node) {
      const parent = node.parent;
      if (parent?.type !== "CallExpression") return false;
      const callee = parent.callee;
      if (callee.type === "Identifier") {
        return /^(make|build|create)[A-Z]/.test(callee.name);
      }
      return false;
    }
    function isAlreadyCoveredByOtherPath(node) {
      const parent = node.parent;
      if (!parent) return false;
      if (parent.type === "TSAsExpression" || parent.type === "TSTypeAssertion") return true;
      if (parent.type === "VariableDeclarator") {
        const decl = parent;
        if (decl.id.type === "Identifier" && decl.id.typeAnnotation) return true;
      }
      return false;
    }
    return {
      // pattern A: { ... } as User
      TSAsExpression(node) {
        const name = typeNameOf(node.typeAnnotation);
        if (name && entities.includes(name) && node.expression.type === "ObjectExpression") {
          reportInlineEntity(node, name);
        }
      },
      // pattern B: <User>{ ... }
      TSTypeAssertion(node) {
        const name = typeNameOf(node.typeAnnotation);
        if (name && entities.includes(name) && node.expression.type === "ObjectExpression") {
          reportInlineEntity(node, name);
        }
      },
      // pattern C: const u: User = { ...3+ properties... }
      VariableDeclarator(node) {
        if (node.init?.type === "ObjectExpression" && node.init.properties.length >= 3 && node.id.type === "Identifier" && node.id.typeAnnotation?.typeAnnotation) {
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
      }
    };
  }
});

// src/rules/no-typeorm-set-undefined.ts
var import_eslint_utils2 = __toESM(require_eslint_utils());
var DEFAULT_FILE_PATTERNS = [".repository.", ".repo."];
var createRule2 = (0, import_eslint_utils2.RuleCreator)(
  (name) => `https://github.com/innovmind/musaium/blob/main/tools/eslint-plugin-musaium-test-discipline/README.md#${name}`
);
var isUndefinedLiteral = (node) => {
  if (!node) return false;
  return node.type === "Identifier" && node.name === "undefined";
};
var propertiesWithUndefined = (obj) => {
  const offenders = [];
  for (const prop of obj.properties) {
    if (prop.type !== "Property") continue;
    if (prop.shorthand) continue;
    if (prop.computed) continue;
    if (isUndefinedLiteral(prop.value)) {
      offenders.push(prop);
    }
  }
  return offenders;
};
var propertyName = (prop) => {
  const key = prop.key;
  if (key.type === "Identifier") return key.name;
  if (key.type === "Literal" && typeof key.value === "string") return key.value;
  return "<unknown>";
};
var no_typeorm_set_undefined_default = createRule2({
  name: "no-typeorm-set-undefined",
  meta: {
    type: "problem",
    docs: {
      description: "Forbid `field: undefined` in TypeORM `.set()` and `repo.update()` calls \u2014 silently skipped, leaves columns unchanged. Use `field: () => 'NULL'` instead."
    },
    schema: [
      {
        type: "object",
        properties: {
          filePathPatterns: { type: "array", items: { type: "string" } }
        },
        additionalProperties: false
      }
    ],
    messages: {
      setUndefined: "`{{field}}: undefined` in `.set()` is silently skipped by TypeORM (UpdateQueryBuilder filters undefined values before generating SQL). The column will not be cleared \u2014 leading to replayable one-time tokens. Use `{{field}}: () => 'NULL'` instead. See user.repository.pg.ts verifyEmail for reference.",
      updateUndefined: "`{{field}}: undefined` in `repo.update()` is silently skipped by TypeORM \u2014 `repo.update()` forwards to `.set()` internally. Use `{{field}}: () => 'NULL'` instead. See user.repository.pg.ts verifyEmail for reference."
    }
  },
  defaultOptions: [{}],
  create(context, [opts]) {
    const filename = context.filename ?? context.getFilename?.() ?? "";
    const patterns = opts?.filePathPatterns ?? DEFAULT_FILE_PATTERNS;
    if (!patterns.some((p) => filename.includes(p))) {
      return {};
    }
    return {
      // Pattern A: <anything>.set({ field: undefined, ... })
      CallExpression(node) {
        if (node.callee.type !== "MemberExpression") return;
        const prop = node.callee.property;
        if (prop.type !== "Identifier") return;
        if (prop.name === "set" && node.arguments.length === 1) {
          const arg = node.arguments[0];
          if (arg?.type === "ObjectExpression") {
            for (const offender of propertiesWithUndefined(arg)) {
              context.report({
                node: offender,
                messageId: "setUndefined",
                data: { field: propertyName(offender) }
              });
            }
          }
          return;
        }
        if (prop.name === "update" && node.arguments.length >= 2) {
          const arg = node.arguments[1];
          if (arg?.type === "ObjectExpression") {
            for (const offender of propertiesWithUndefined(arg)) {
              context.report({
                node: offender,
                messageId: "updateUndefined",
                data: { field: propertyName(offender) }
              });
            }
          }
        }
      }
    };
  }
});

// src/rules/no-undisabled-test-discipline-disable.ts
var import_eslint_utils3 = __toESM(require_eslint_utils());
var AST_TOKEN_TYPES = {
  Line: "Line",
  Block: "Block"
};
var TARGET_PLUGIN = "musaium-test-discipline";
var TARGET_RULES = [
  "musaium-test-discipline/no-inline-test-entities",
  "musaium-test-discipline/no-undisabled-test-discipline-disable"
];
var createRule3 = (0, import_eslint_utils3.RuleCreator)(
  (name) => `https://github.com/innovmind/musaium/blob/main/tools/eslint-plugin-musaium-test-discipline/README.md#${name}`
);
var no_undisabled_test_discipline_disable_default = createRule3({
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

// src/index.ts
var plugin = {
  rules: {
    "no-inline-test-entities": no_inline_test_entities_default,
    "no-typeorm-set-undefined": no_typeorm_set_undefined_default,
    "no-undisabled-test-discipline-disable": no_undisabled_test_discipline_disable_default
  }
};
module.exports = plugin;
