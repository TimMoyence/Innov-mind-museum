# Lessons — zod (v4.4.1)

Audit 2026-05-18 : **PASS — 0 blockers**. v4 idioms clean across 40 importing files (sampled 14).

## ✅ V4 compliance complete
- ZERO `.string().email/uuid/url` deprecated → all use top-level `z.email()`/`z.uuid()`/`z.url()`/`z.iso.datetime()`
- ZERO `.format()/.flatten()` → custom formatter `zod-issue.formatter.ts` reads `issue.path` + `issue.message` via v4 `z.core.$ZodIssue` type
- ZERO `nativeEnum` (removed v4) → use `z.enum([...])`
- ALL `z.record()` use TWO-arg form `z.record(z.string(), z.unknown())`
- ZERO `required_error/invalid_type_error` (v3 deprecated)
- ZERO `.merge()` / `.strict()` / `.passthrough()` deprecated patterns
- ZERO `z.intersection()` deprecated → use `.extend()` / `.and()`

## ✅ Trust-boundary discipline
- 26 `safeParse` sites in trust-boundary middlewares (validate-body, validate-query, jwt-decode FE+BE)
- ZERO raw zod `.parse()` at HTTP boundary (verified via grep)
- 57 occurrences `.parse` are all `JSON.parse/Number.parse/Date.parse/parseInt`

## ✅ Coercion discipline
- 20 `z.coerce.number()` sites correctly chained `.int()/.min()/.max()` bounds — safe against NaN/Infinity (v4 z.number() rejects them)
- ZERO `z.coerce.boolean` (which has 'false'→true truthy gotcha) — bool inputs use explicit `z.preprocess` + string-to-bool mapping (`chat-session.schemas optionalBoolean`)

## ⚠️ Opportunities LOW priority
- **TD-ZOD-01 LOW** : `z.config(z.locales.fr())` not set → raw error messages remain English. FR-first app should localize zod messages côté backend boot.
- **TD-ZOD-02 LOW** : no `.brand<>()` types for numeric IDs (userId vs museumId both `number`). Cross-pass not prevented by type system — V1.1 add.
- **TD-ZOD-03 trivial** : 4 sites `z.union([X, z.null()])` could be `X.nullable()` (terser) — chat.contracts.ts L288/299/302/303 + auth.schemas.ts L93.
- `z.treeifyError`/`z.prettifyError` NOT adopted — project uses custom formatter (preserves pinned wire format for tests). DON'T migrate without coordinating test snapshots.

## ✅ Anti-patterns absent
- ZERO `.refine()` chain order issues
- ZERO callback-based legacy plural format
- ZERO `discriminatedUnion` misuse (1 use site correct in content-classifier.service.ts:34)
