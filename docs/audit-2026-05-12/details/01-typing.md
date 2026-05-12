# 01 — Typing audit
**Date:** 2026-05-12  **Agent:** AGENT-01

## Verdict
- **museum-backend: 90/100** — strict + ratchet-enforced + zero production `as any`; the only blemishes are TypeORM definite-assignment idioms and unvalidated external-API JSON casts.
- **museum-frontend: 94/100** — strictest tsconfig of the three (`noUncheckedIndexedAccess`), zero production `as any`, eslint-disables are minimal and justified.
- **museum-web: 92/100** — clean source, but missing `noUncheckedIndexedAccess` is a downgrade vs FE.
- **Overall:** This codebase has *enterprise-grade* typing discipline for a pre-launch B2C product. All three apps run `tseslint.configs.strictTypeChecked`, an `as-any-baseline.json` sentinel pins production source at **0 `as any`** for backend/frontend/web, and the ratchet is wired into a hook. The legitimate weak points are all at I/O boundaries (external HTTP, JWKS, TypeORM partial-entity FK shortcuts), which is where unsoundness *should* live. The biggest typing risk is not laxity — it's that ~13 production sites cast `fetch().json()` directly to typed shapes without runtime validation, including the social-login JWKS path (`social-token-verifier.ts:56`). That's where I'd put resolution effort.

## Method

**Queries run** (all scoped, all excluding `node_modules/`, `.stryker-tmp/`, `dist/`, `coverage/`, `build/`, `.test-dist/`, `museum-frontend/shared/api/generated/`, `museum-web/.next/`):

| # | Pattern | Purpose |
|---|---|---|
| 1 | `: any[ ,)>;}]` | Concrete `: any` declarations |
| 2 | `as any` | Explicit any casts |
| 3 | `@ts-(ignore|expect-error)` | Type-system bypass directives |
| 4 | `eslint-disable.*@typescript-eslint` | Linter bypasses (with rule breakdown) |
| 5 | `\w!\.\w` | Runtime non-null property access |
| 6 | `[a-zA-Z]!\s*=?` | All `!` postfixes (entity assertions vs runtime) |
| 7 | `Record<string,\s*(any|unknown)>` | Loose object types |
| 8 | `Partial<` | Partial overuse |
| 9 | `JSON.parse` | Untyped boundary deserialization |
| 10 | `response\.json\(\)\) as` | Blind external-API casts |
| 11 | `:\s*(Function|object|\{\})[ ,)>;]` | Loose generic types |
| 12 | `z.infer<typeof` | Zod-derived types |
| 13 | `as [A-Z][a-zA-Z<>]+` (filtered) | Custom-type assertions |
| 14 | `export function ...) ... {` | Missing return annotations on exports |

**Coverage**

| App | Files scanned (ts/tsx, excl. generated/dist) |
|---|---|
| museum-backend (src + tests) | 1 012 |
| museum-frontend (features + shared + app + __tests__) | 540 |
| museum-web (src) | 106 |
| **Total** | **1 658** |

`tsconfig` and `eslint.config.mjs` of all three apps inspected directly.

## P0 — Critical findings

**None.** No `: any` in production, no `as any` in production source (ratchet enforces zero), no runtime `!.x` non-null property accesses anywhere in `museum-backend/src`, `museum-frontend/features|shared|app`, or `museum-web/src`. No `@ts-ignore` outside Next.js build artifacts and one justified test override.

## P1 — Important findings

### P1-1 — Unvalidated external-API JSON casts (13 sites in BE)

**Where:**
- `museum-backend/src/modules/auth/adapters/secondary/social/social-token-verifier.ts:56` — `(await response.json()) as JwksResponse`
- `museum-backend/src/modules/auth/adapters/secondary/social/google-token-exchange.ts:80` — `(await response.json()) as GoogleTokenResponse`
- `museum-backend/src/modules/chat/adapters/secondary/embeddings/replicate.adapter.ts:238` — `as ReplicatePrediction`
- `museum-backend/src/modules/chat/adapters/secondary/embeddings/replicate.adapter.ts:224` — `as { detail?: string } | undefined`
- `museum-backend/src/modules/chat/adapters/secondary/guardrails/llm-guard.adapter.ts:129` — `as Partial<ScanResponse>`
- `museum-backend/src/modules/chat/adapters/secondary/search/{tavily,google-cse,brave-search,searxng,duckduckgo}.client.ts` — five Web-search adapters, all `as XxxApiResponse`
- `museum-backend/src/shared/http/overpass.client.ts:54`, `overpass-transport.ts:62` — `as OverpassResponse`
- `museum-backend/src/shared/http/nominatim.client.ts:169,268` — `as NominatimResponseItem[]` / `NominatimReverseResponseItem`

**Why it matters:** These are the *real* type-system holes. The TS compiler trusts the assertion; runtime data could be `null`, missing `keys`, missing `access_token`, etc. and the first failure happens deep in the use-case (often as `Cannot read properties of undefined`). For the JWKS path this is auth-critical (Apple/Google rotate keys; a malformed response → silent auth failure or worse, a confusing error attributed to the user). For the search adapters this is recoverable (fail-open by design), so risk is lower.

**Right fix:**
1. **Auth-critical (JWKS, OIDC token exchange):** wrap with zod parse. Pattern already used elsewhere in the codebase (`jwt-decode.ts:20,39` parses to `unknown` then narrows). Move JWKS/token-exchange to the same discipline.
2. **Search adapters and embeddings:** lower priority — fail-open paths already swallow downstream errors. Add at minimum a `z.safeParse` at the boundary so observability reports schema drift as a metric, not as a generic `TypeError`.
3. **Nominatim/Overpass:** these have been stable for years, but if you ever upgrade Overpass syntax, a runtime guard catches the drift fast.

### P1-2 — TypeORM partial-entity casts (`{ id } as ChatMessage`)

**Where:**
- `museum-backend/src/modules/chat/adapters/secondary/persistence/chat.repository.typeorm.ts:86,189,203,413`
- `museum-backend/src/modules/chat/adapters/secondary/persistence/artKeyword.repository.typeorm.ts:53`

```ts
message: { id: saved.id } as ChatMessage,        // line 203
session: { id: input.sessionId } as ChatSession, // line 189
user: input.userId ? ({ id: input.userId } as ChatSession['user']) : null, // line 86
```

**Why it matters:** TypeORM accepts `{ id }` as an FK shortcut, but the cast lies — the object isn't a `ChatMessage`. If a downstream helper ever calls `.text` or `.userId` on this stub it'll silently get `undefined`. Today nothing does, but the lie compiles.

**Right fix:** Use `Pick<ChatMessage, 'id'>` as the literal type so the structural contract is honest. TypeORM `save()` accepts `DeepPartial<T>` and `QueryDeepPartialEntity<T>` — both are typed correctly upstream. The cast is unnecessary if you build the param object as `Partial<Pick<ChatMessage, 'id'>>` or use the `Pick<...>` annotation on the local variable.

## P2 — Minor / cosmetic

### P2-1 — Two BE exported functions missing return-type annotation

- `museum-backend/src/helpers/middleware/require-role.middleware.ts:17` — `requireRole(...allowedRoles: UserRole[])` infers `(req,res,next) => void`.
- `museum-backend/src/helpers/middleware/upload-admission.middleware.ts:10` — `createUploadAdmissionMiddleware(maxConcurrent = 50)`.

**Why:** Both inner middlewares are fully typed (`(req: Request, res: Response, next: NextFunction): void`), so the inference is correct, but adding `: RequestHandler` to the outer function makes the public contract explicit and prevents accidental changes from leaking through type inference.

### P2-2 — Single `eslint-disable` without justification in BE/src

- `museum-backend/src/modules/chat/adapters/secondary/audio/text-to-speech.openai.ts:141` — `// eslint-disable-next-line @typescript-eslint/require-await`

Out of 83 `@typescript-eslint` disables in BE production source, **82 have a justification** (compliant with `LINT_DISCIPLINE`). One missing. Trivial fix.

### P2-3 — Web `tsconfig` missing `noUncheckedIndexedAccess`

`museum-web/tsconfig.json` has `"strict": true` and nothing else. `museum-frontend/tsconfig.json` has the stricter `"noUncheckedIndexedAccess": true`. Enabling it on web is a one-line change. Will surface ~10–30 sites that need a guard or `assert`. Worth the cost — admin pages parse a lot of array index access.

### P2-4 — Web missing other strict ratchets

`museum-web` also lacks `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noImplicitReturns` (BE has all three). Cosmetic for a 106-file codebase, but aligning the three configs takes minutes.

### P2-5 — `social-otc-store.ts:125` casts Redis payload to generic `TPayload`

```ts
return JSON.parse(value) as TPayload;
```

The `TPayload` is whatever the issuer wrote in. Risk is limited because issuer + consumer are co-located inside the OTC flow, but if you ever change the payload shape and forget to invalidate Redis, you get a runtime mismatch. A zod-parameterized variant of the store (caller passes the schema) would be ideal — not urgent.

### P2-6 — 3 test files with `(props: any)` mocks in FE

- `museum-frontend/__tests__/screens/{home,auth,settings}.test.tsx`

Standard pattern for `jest.mock(...)` factory returns. Test scope only — fine, ratchet correctly excludes tests.

## Patterns observed (not bugs but trends)

1. **`unknown` is used correctly throughout.** Every `JSON.parse` in BE (14 sites) goes to `unknown` first (only one exception: the parameterized OTC store). FE/Web follow the same discipline. This is the textbook defensive pattern.

2. **`Record<string, unknown>` is the standard log/context shape** (113 sites in BE, 29 in FE, 10 in Web). All justified — `logger`, `Sentry scrubber`, `auditLog.metadata`, etc. Not laziness.

3. **Zod ↔ TS pattern is consistent.** 24 BE files use zod schemas, 24 BE files use `z.infer<typeof X>`. Schemas live at the HTTP boundary (`adapters/primary/http/schemas/`) and JSONB column boundaries (`shared/db/jsonb-schemas/`). Domain types are hand-written, schemas are at the wire. This is the right separation — *no observed drift*.

4. **TypeORM entity `!` declarations are the dominant `!` use case.** Every `id!: string` / `column!: T` is a definite-assignment assertion that TypeORM populates at construction time. `tsconfig.json` correctly disables `strictPropertyInitialization` only on BE (where TypeORM lives). Zero runtime `!.x` property-access non-null assertions across all three production trees.

5. **ESLint discipline is enforced and audited.**
   - BE production: 83 typescript-eslint disables, 82 with `-- justification`. Top rules disabled: `require-await` (25, mostly for interface conformance), `prefer-nullish-coalescing` (24), `no-unnecessary-condition` (17 — all "runtime data" defensive).
   - FE production: 34 typescript-eslint disables, all justified. Top rule: `no-unnecessary-condition` (16, "runtime API data" / "async cancellation guard" — legitimate).
   - Web production: **0** typescript-eslint disables. The 20 `@ts-ignore` hits are entirely in `.next/types/validator.ts` (Next.js build artifact).

6. **The `as-any-baseline.json` ratchet (`scripts/sentinels/as-any-ratchet.mjs`) is real and enforced.** Baseline = `{backend: 0, frontend: 0, web: 0}`. Only counts `*.ts(x)` excluding `.test.ts(x)` and `.spec.ts(x)`. Tests can use `as any` freely; production cannot. The ratchet is monotonic-decrease — you cannot raise it.

7. **`Partial<T>` is not abused.** 8 BE sites (TypeORM update patches, parser tokens), 2 FE sites (require-mod check, persisted-state hydration), 7 Web sites (all test factory `overrides`).

## Recommendations

Ranked by ROI (highest first).

1. **(P1) Add zod validation to the JWKS fetch path** — `social-token-verifier.ts:56`. Auth-critical, ~10 lines, removes the only auth-flow blind cast. Same template applies to `google-token-exchange.ts:80`. Estimated impact: hardens the social-login path against provider JWKS shape drift.

2. **(P1) Replace TypeORM entity-stub casts with `Pick<>`** — 5 sites in `chat.repository.typeorm.ts` + 1 in `artKeyword.repository.typeorm.ts`. ~30 minutes of mechanical refactor. Eliminates the only category of structural-lie casts left in BE production.

3. **(P2) Enable `noUncheckedIndexedAccess` in `museum-web/tsconfig.json`** — one line, surfaces ~10–30 unguarded array accesses (admin pages mostly). Brings web to parity with FE. Estimated impact: small, but worth it before launching the admin panel.

4. **(P2) Wrap external-search-adapter JSON deserialization** — Tavily, Brave, Google-CSE, SearXNG, DuckDuckGo (5 sites). Lower priority because all 5 are fail-open by design. Use `z.safeParse` and emit a metric on failure — turns schema drift into a signal instead of an error.

5. **(P2) Add return-type annotations to the 2 exported BE middleware factories.** ~5 minutes.

6. **(P2) Decide on `as TPayload` policy in `social-otc-store.ts:125`.** Either accept the generic-parameter contract (document it) or take a schema-parametrized variant. Not urgent.

7. **(Polish) Align web tsconfig flags with BE/FE** — `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noImplicitOverride`. Trivial.

8. **(Watch) Monitor BE `eslint-disable` density.** 83 disables in 1012 files (~8%) is fine. If it grows past ~12% you've started to leak. The justification-discipline is already enforced; just keep auditing it.

**What you do NOT need to do:** introduce stricter `no-explicit-any`, add a separate ratchet for `: any` (the ESLint `no-explicit-any` rule + the as-any ratchet already cover both forms), or audit non-null assertions further (you already eliminated runtime `!.x` everywhere).
