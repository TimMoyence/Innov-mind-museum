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

---

## Audit 2026-05-20 (delta) — v4.4.3, refresh after structured-output regression hunt

**Verdict** : **PASS with 1 RE-OPENED ticket** (TD-LC-04). Library bumped 4.4.1 → 4.4.3 ; no breaking changes between those patches (v4.4.2 = `.preprocess()` optionality fix, v4.4.3 = `.catch()` / `.preprocess()` absent-key fix). No new security advisories upstream.

### ✅ Status updates since 2026-05-18

- **TD-ZOD-01 RESOLVED** — `z.config(z.locales.fr())` now wired in `museum-backend/src/instrumentation.ts:17` (after `initSentry()` + `initOpenTelemetry()`, before any app schema parses). FR error messages confirmed propagating through `validate-body.middleware.ts`.
- **TD-ZOD-03 RESOLVED** — the 4 `z.union([X, z.null()])` sites in `chat.contracts.ts` + `auth.schemas.ts` now use `.nullable()` (verified `chat.contracts.ts:288,299,302,303`).
- **TD-ZOD-02 LOW unchanged** — no `.brand<>()` on numeric IDs. Acceptable for V1 ; revisit V1.1 if cross-pass bugs surface.

### ⚠️ TD-LC-04 RE-OPENED — `z.record(z.string(), z.unknown())` in structured-output schema

`museum-backend/src/modules/knowledge-extraction/useCase/classification/content-classifier.service.ts:26-31` — five fields (`openingHours`, `admissionFees`, `collections`, `currentExhibitions`, `accessibility`) all typed `z.record(z.string(), z.unknown()).nullable()` and fed to `llm.withStructuredOutput(classificationSchema)`.

**Problem** : OpenAI strict structured output and Gemini both reject free-form-key shapes (require `additionalProperties: false` + every key in `required: [...]`). Either (a) the LangChain adapter silently drops `strict: true` and the model emits unconstrained shapes, or (b) the call is failing in a path swallowed by `/** Returns null on any LLM error. */`. Either way, the schema does NOT enforce what its TS types claim.

**Remediation paths** (cf. snapshot 2026-05-20 §Cross-reference) :
1. Enumerate keys explicitly via nested `z.object({...})` — type-safe but tedious.
2. **(recommended)** Accept as `z.string().nullable()` (raw JSON), `JSON.parse + z.record(...)` downstream. Loses strict-mode validation but keeps wire round-trip.
3. Drop `strict: true` on this section.

Owner : `/team` pipeline (knowledge-extraction module). Effort : S (≤2h). Blocking : NO for V1 launch (extraction is admin-only, B2B feature).

### ✅ Reference template — DO this for structured output

`museum-backend/src/modules/chat/useCase/llm/llm-sections/main-assistant-output.schema.ts` (`mainAssistantOutputSchema`) — every field `.nullable()` (never `.optional()` alone), no `.default()`, no `z.record(...)`, `.describe(...)` on every field, `z.discriminatedUnion(...)` for the nested artwork-detection branch. JSDoc enumerates OpenAI's structured-output constraints inline (§14-25). Use as canonical reference for any new section schema.

### ✅ Trust-boundary discipline unchanged

26 `safeParse` sites at trust boundaries ; **zero** raw `.parse()` on HTTP boundaries across BE + FE + Web. All `.parse(` matches in app code are `JSON.parse` / `Number.parse` / `Date.parse` / `parseInt` / Readability `reader.parse()` — not Zod.

### ✅ v4.4 cumulative compat verified

- ZERO `.merge()` calls (v4.4 throws on receivers with refinements) ; `.extend()` used throughout.
- ZERO `z.url()` calls relying on the pre-v4.4 lax acceptance of `https:/x`.
- ZERO `z.base64()` calls with whitespace-tolerant inputs.
- ALL `z.preprocess()` sites (5 in `chat-session.schemas.ts`) audited against the v4.4.2 inner-optionality semantics — no double-optional patterns.

### ⚠️ Cross-app schema sharing — drift risk documented

`@musaium/shared` exports observability + Sentry scrubbers, NOT shared schemas. BE and FE maintain independent zod schemas for the same domain objects (login, register, profile-update). Pre-V1 decision : do NOT block on extraction. Drift case study : DOB-2026-05-17 — FE accepted `DD/MM/YYYY` via `parseDateOfBirth` ; BE accepted only `YYYY-MM-DD`. The bug was a regex divergence, but a shared schema would have prevented it. Re-evaluate V1.1.
