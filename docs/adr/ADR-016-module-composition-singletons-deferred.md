# ADR-016 — Module composition singletons (F6) deferred to dedicated PR

Status: Accepted — 2026-04-30
Context: Audit 2026-04-30 finding F6

## Question

The 2026-04-30 audit flagged top-level repository instantiation as MEDIUM in three module composition roots:

- `museum-backend/src/modules/museum/useCase/index.ts:31` — `new MuseumRepositoryPg(AppDataSource)`
- `museum-backend/src/modules/auth/useCase/index.ts:54-58` — `new UserRepositoryPg(AppDataSource)`, `new SocialAccountRepositoryPg(...)`, `new RefreshTokenRepositoryPg(...)`, `new TotpSecretRepositoryPg(...)`
- `museum-backend/src/modules/review/useCase/index.ts:23` — `new ReviewRepositoryPg(AppDataSource)` (the prior `new UserRepositoryPg(...)` here was already removed in F4)

Suggested fix: "lazy via createApp factory" — instantiate inside `createApp()` rather than at module import.

## Decision

**Defer to a dedicated PR.** Keep the module-load singletons in this audit cycle. Document the constraints and the migration plan so the next sprint starts with a clear contract.

## Why defer

The audit's preferred fix is a full move from the singleton-export pattern to factory functions called from `createApp()`. That would touch:

1. Every module composition root (auth ~30 exports, museum ~10 exports, chat already partially factory-based, review ~5 exports, support, admin, etc.)
2. Every consumer that imports a use case by name (~80 call sites across routes, tests, and other modules)
3. Test infrastructure — `tests/helpers/http/route-test-setup.ts`, `tests/helpers/e2e/e2e-app-harness.ts`, every `jest.mock('@modules/<x>/useCase')` factory.

Doing this correctly (without breaking comportement public, with TDD on each module) is a multi-day refactor. The scope dwarfs the rest of the audit findings combined and overlaps F3 (chat module DI), F4 (review port), F2 (auth wireMiddleware) — which already pulled the easier wins out of the same area.

We currently get most of the practical benefit for free:

- F2 moved auth's middleware wiring into `createApp()` — module import no longer mutates middleware globals.
- F3 introduced a chat module registry the test layer can swap.
- F4 consolidated review onto `userRepository` from auth's composition root.
- F5 lifted the cross-module port contract to `shared/`.

The remaining "module-load constructs an `AppDataSource`-bound repository" surface is architecturally suboptimal but has not produced a real test-isolation or DI failure since the chat singleton story landed.

## Concrete migration plan (for the future PR)

Phase 1 — auth (highest fan-in)
- Convert `auth/useCase/index.ts` exports into a `buildAuthModule(deps)` factory returning the same shape as today.
- Add a thin compatibility barrel that calls `buildAuthModule(AppDataSource)` once at first import for tooling that hasn't migrated, with a deprecation comment.
- `createApp()` calls `buildAuthModule(...)` explicitly and passes the result to wiring.
- Migrate consumers (auth route, admin route, review route, settings route) to receive the built module via DI instead of importing named singletons.
- Update the three `jest.mock('@modules/auth/useCase')` factories to mock `buildAuthModule` instead.

Phase 2 — museum
- Mirror Phase 1 for `museum/useCase/index.ts`. Less fan-in (~10 exports, ~25 call sites). Should land in a single afternoon once Phase 1 patterns are proven.

Phase 3 — review + support
- Trivial after Phase 1 and 2: smaller composition roots, fewer consumers. Bundle into one PR.

Phase 4 — drop the compatibility barrels and the chat module registry workaround
- Convert `chat-module-singleton.ts` into the same factory pattern; `createApp()` becomes the single composition root.
- Remove the `setActiveChatModule()` test override hook introduced by F3 — replaced by passing the module directly.

## Acceptance criteria for the future PR

- Every module composition root is a function (`buildXModule(deps)`), not a file with side effects on import.
- `createApp()` is the only thing that constructs domain modules.
- Tests no longer need `jest.mock('@modules/<x>/useCase')` factories — they pass mock modules to `createApp()` overrides directly.
- Backend full suite stays green per commit. Coverage threshold doesn't drop.
- ADR-016 (this file) is removed in the same commit that lands Phase 4.

## Why this is honest engineering

The "anti-pattern" framing of module-load singletons is real but the cost-of-fix in this codebase is high precisely because the pattern is consistent — every module already does it. The right time to refactor is when the productivity tax bites (a real test-isolation incident, a circular-init bug that lazy imports can't break) or when an adjacent feature requires the change (e.g. multi-tenant per-request module instances). Until then, this ADR records the awareness.

Audit finding F6 is not closed; it is sequenced.
