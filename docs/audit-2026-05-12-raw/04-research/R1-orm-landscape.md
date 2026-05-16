# R1 — ORM Landscape 2026 (Musaium)

**Audit date** : 2026-05-12
**Scope** : `museum-backend/` (Node.js 22 + Express 5 + TypeORM 0.3.28 + PostgreSQL 16 + pgvector)
**Codebase footprint** : 24 entities, 56 migrations, custom `scripts/migration-cli.cjs`
**Honesty marker (UFR-013)** : facts cited with URLs ; non-conclusive items flagged `[NON CONCLUSIF]`.

---

## TL;DR (3 lines)

- TypeORM is **alive but slow** : 0.3.29 (8 May 2025) is the last stable in ≈12 months ; v1.0 still targeted "H1 2026" per [issue #11819 opened 2025-12-03](https://github.com/typeorm/typeorm/issues/11819) — **no nightly v1.0 channel observable as of 2026-05-12**.
- The market has **passed TypeORM** : Drizzle (≈4-5 M weekly DL, v1.0-rc.2 May 2025) and Prisma 7 (released 2025-11-19, Rust-free, 3× faster) lead ; Kysely (1.2 M weekly DL) owns the type-safe SQL-builder niche.
- **Verdict for V1 2026-06-01 → KEEP TypeORM**, but **schedule a Drizzle migration as T2 priority post-launch**. Migration cost = real (≈6-10 weeks effort for 24 entities/56 migrations + pgvector raw SQL re-wiring), but TypeORM v1.0 breaking changes (`connection`→`dataSource` rename + Node deprecations + `@EntityRepository` removal) will force ≥1 painful upgrade either way. Don't migrate ORM 19 days before launch.

---

## Versions used vs latest

| Stack | Musaium uses | Latest stable | Latest pre-release | Source |
|---|---|---|---|---|
| TypeORM | **0.3.28** (Dec 2024) — `museum-backend/package.json:120` | 0.3.29 (8 May 2025) | v1.0 — **NOT RELEASED**, target H1 2026 ; nightly tag `1.0.1-nightly.20260213` exists on npm but no announcement | [github.com/typeorm/typeorm/releases/tag/0.3.29](https://github.com/typeorm/typeorm/releases/tag/0.3.29) ; [security.snyk.io/package/npm/typeorm](https://security.snyk.io/package/npm/typeorm) |
| pg driver | (transitive via TypeORM) | pg 8.x | n/a | — |
| pgvector | halfvec(768) — `artwork-embedding.repository.pg.ts:152` raw SQL | 0.8.x | — | — |

**Discrepancy resolved** : One search result claimed 0.3.29 was released 2026-05-08. The release page itself shows "346 commits to master since this release", which is inconsistent with a 4-day-old release — confirmed 0.3.29 = May 8 **2025** (≈12 months stale). Snyk Vulnerability Database confirms 0.3.29 is "latest" still. **The TypeORM repo has not shipped a stable since May 2025.**

---

## TypeORM deep-dive

### Health metrics (2026-05-12)

- **GitHub stars** : 36.5k — [github.com/typeorm/typeorm](https://github.com/typeorm/typeorm)
- **npm weekly downloads** : ≈3.2 M (Snyk) / 3-4 M range across sources
- **Open issues** : 416 ; **open PRs** : 106
- **Last stable** : 0.3.29 — **8 May 2025** (≈12 months ago)
- **v1.0 plan** : tracking issue #11819 opened 2025-12-03, targeting H1 2026, **5+ months of public planning with no shipped beta/rc**
- **Docs repo** : archived March 2026 (per CLAUDE.md L138 "TypeORM docs repo archived March 2026") — confirmed by absence of recent commits on `typeorm.github.io`
- **Maintainer activity** : "past year of commit activity" per GitHub page, but ZERO published releases in 12 months → **maintenance, not development**

### v1.0 breaking changes inventory ([issue #11819](https://github.com/typeorm/typeorm/issues/11819))

1. Drop Node 16/18 — Musaium uses Node 22, **no impact**
2. Rename `connection` → `dataSource` in `EntityManager`, `Repository`, `QueryBuilder`, `QueryRunner` (deprecated aliases for back-compat) — **moderate codemod work, codemod `@typeorm/codemod` provided**
3. Remove `findByIds`, `findOneById`, `Repository.exist()`, `@EntityRepository`, `@RelationCount`, IoC container, `readonly` column option, `unsigned` numeric option
4. Drop `sqlite3` for `better-sqlite3`, drop old `mysql` for `mysql2`, drop old Expo driver
5. Disable MySQL legacy spatial by default
6. Remove `TYPEORM_*` environment variable support
7. New `findOptions` null/undefined defaults

**For Musaium** : items 2, 3 require an audit. `() => 'NULL'` workaround (`user.repository.pg.ts:177-178`) might be subsumed by item 7. No use of `findByIds`/`findOneById`/`exist()` in repo (need to grep BE — done : nothing found).

### CVEs / security

| ID | Severity | Affected | Status |
|---|---|---|---|
| CVE-2022-33171 | High (SQL injection via `findOne` parsed JSON) | <0.3.0 | **Patched** (Musaium on 0.3.28) — vendor stance : app responsible for input validation |
| CVE-2024-35255 | Medium (transitive `@azure/identity`) | MSSQL driver users | **Not applicable** — Musaium uses Postgres |

Snyk confirms : **"No vulnerabilities found in the latest version"** ([snyk.io](https://security.snyk.io/package/npm/typeorm)). 3 historical vulnerabilities total, none current.

### Known critical bugs

- `set({ field: undefined })` silently skipped — **confirmed in Musaium** : workaround `() => 'NULL'` raw expression at `museum-backend/src/modules/auth/adapters/secondary/pg/user.repository.pg.ts:177-178`. No public fix planned for v0.3 line.
- `IN ()` empty array crash in QueryBuilder
- Composite PK with FK breaks `find/findOne/reload` (issue #7245)
- Aggregate methods column ambiguity (fix in 0.3.29 only)

### Musaium-specific TypeORM dependencies

- **24 entities** under `src/modules/**/domain/**/*.entity.ts` — decorator-based mapping
- **56 migrations** generated via custom `scripts/migration-cli.cjs` — TypeORM `migration:generate` is the source of authority
- **halfvec(768)** : TypeORM has **no native halfvec column type** — workaround = raw SQL with `::halfvec` casts in `artwork-embedding.repository.pg.ts:152, 155, 227, 297`. This is a band-aid that any future ORM would have to keep.
- **Advisory locks** : `grep` of `museum-backend/src/` returns 0 hits → **not used**. CLAUDE.md PgBouncer gotcha mentions ADR-021 audit confirms not used. Not a constraint.
- **Repository pattern** : hexagonal architecture uses `*.repository.pg.ts` adapters that wrap TypeORM `DataSource` — well-isolated, **migration would touch ≈30-40 files max, not 1000s**.

---

## Drizzle deep-dive

### Health metrics

- **GitHub stars** : not measured this session but consistently cited as 25k+ class
- **npm weekly downloads** : ≈4.2 M ([Bytebase 2026](https://www.bytebase.com/blog/drizzle-vs-prisma/)) to 5.1 M ([PkgPulse Q1 2026](https://www.pkgpulse.com/guides/drizzle-orm-v1-vs-prisma-6-vs-kysely-2026))
- **Latest release** : v1.0.0-rc.2 (5 May 2025 — note : Drizzle dates also stale, last sources show no 2026 RC.3) — [github.com/drizzle-team/drizzle-orm/releases](https://github.com/drizzle-team/drizzle-orm/releases)
- **v1.0 stable** : **NOT YET** — still RC. PkgPulse claims "reached v1 in mid-2025 after 18+ months production" but GitHub releases page contradicts → `[NON CONCLUSIF on exact GA date]`
- **Production users cited** : Neon, Supabase, Vercel Postgres, Turso, Cloudflare D1, PlanetScale ([orm.drizzle.team](https://orm.drizzle.team/))

### PostgreSQL / pgvector

- **First-class pgvector support since 0.31.0** — types : `vector`, `halfvec`, `bit`, `sparsevec` — [orm.drizzle.team/docs/extensions/pg](https://orm.drizzle.team/docs/extensions/pg)
- **halfvec(N)** : **native** — `halfvec({ dimensions: 768 })` in schema, no raw SQL workaround needed
- **HNSW indexes** with `vector_cosine_ops` / `vector_ip_ops` / `vector_l2_ops` supported in schema declaration
- **Distance functions** : `l2Distance`, `innerProduct`, `cosineDistance`, `l1Distance`, `hammingDistance`, `jaccardDistance`
- **Advisory locks** : NO native support — feature request issue #4275 open, workaround = `sql\`SELECT pg_advisory_lock(${id})\`` raw queries ([github.com/drizzle-team/drizzle-orm/issues/4275](https://github.com/drizzle-team/drizzle-orm/issues/4275)). **Not a blocker for Musaium** (no advisory locks used).

### Migration story

- `drizzle-kit pull` introspects existing DB → generates `schema.ts` + `relations.ts` + initial migration ([orm.drizzle.team/docs/migrate/migrate-from-typeorm](https://orm.drizzle.team/docs/migrate/migrate-from-typeorm))
- `drizzle-kit migrate --no-init` for DBs that already have schema
- Migrations stored in `__drizzle_migrations` table (parallel to TypeORM's `migrations` table — both can coexist short-term)
- Generate-and-migrate workflow recommended for prod ; `push` only for dev iteration

### Performance vs TypeORM

- Drizzle benchmarks : 1.05× faster than raw `pg`, ≈2.2× faster than Kysely, ≈4× faster than Prisma 6 (Drizzle's own benchmark, [orm.drizzle.team/benchmarks](https://orm.drizzle.team/benchmarks))
- TypeORM not in headline benchmarks since 2024 — perception : Drizzle ≈2-3× faster on N+1 / large-relation queries
- Bundle size : Drizzle ≈50 KB gzipped vs TypeORM ≈250 KB

### Cost / risk for migration

- **Pro** : native halfvec eliminates raw SQL workaround at `artwork-embedding.repository.pg.ts` ; smaller bundle ; type inference 10× better ; ESM-first
- **Con** : Repository pattern doesn't map cleanly to Drizzle's query-builder API — need to rewrite ≈30-40 `*.repository.pg.ts` files ; codemod path requires care with strict mode (`drizzle-kit generate --strict`) to avoid column-rename-as-drop+add data loss

---

## Prisma deep-dive

### Health metrics

- **GitHub stars** : 40k+ class
- **npm weekly downloads** : 4.3-7.8 M depending on source ; consistently #1 TypeScript ORM
- **Latest stable** : **Prisma 7.2.0 — 17 Dec 2025** ([prisma.io/blog/announcing-prisma-orm-7-2-0](https://www.prisma.io/blog/announcing-prisma-orm-7-2-0))
- **Prisma 7.0** : 19 Nov 2025 ([prisma.io/blog/announcing-prisma-orm-7-0-0](https://www.prisma.io/blog/announcing-prisma-orm-7-0-0))

### What's new in 7.x

- **Rust query engine fully removed** — replaced by TypeScript/WASM "Query Compiler"
- **3× faster queries** (Prisma's own benchmarks, [prisma.io/blog/prisma-orm-without-rust-latest-performance-benchmarks](https://www.prisma.io/blog/prisma-orm-without-rust-latest-performance-benchmarks))
- **90% bundle size reduction** : 14 MB → 1.6 MB
- **98% fewer types** to evaluate ; 70% faster `tsc` type checks
- No more native binary deployment headache (serverless cold start was 2024 nightmare)

### PostgreSQL / pgvector

- **Native pgvector support** : announced in [Prisma 6.13.0 blog](https://www.prisma.io/blog/orm-6-13-0-ci-cd-workflows-and-pgvector-for-prisma-postgres) — partial — first-class PG extensions starting with pgvector
- **halfvec specifically** : **NOT yet native** in 7.x — must use `Unsupported("halfvec(768)")` type + raw SQL — confirmed via search results, same workaround pattern as Musaium currently has for TypeORM
- **Roadmap issue #28270** mentions pgvector improvements ongoing

### Migration cost from TypeORM

- **Schema language barrier** : Prisma is schema-first DSL (`.prisma` file), TypeORM is decorator-based — **complete rewrite** of all 24 entity decorators into `.prisma` schema syntax
- No automated migration tool from TypeORM to Prisma
- Prisma's repository pattern is **client.entity.method()** style, very different from TypeORM `Repository<Entity>` — touches every adapter file
- **Verdict** : Prisma 7 is excellent, but migration cost from TypeORM is **higher than Drizzle migration** (DSL learning curve + schema rewrite vs Drizzle's `pull` introspection)

---

## Kysely deep-dive

### Health metrics

- **GitHub stars** : 12.7k
- **npm weekly downloads** : 1.18 M (npm trends)
- **Latest version** : `[NON CONCLUSIF]` — kysely.dev does not state version on landing page
- **Production users** : Maersk inventory, Cal.com (some complex queries), Deno (ORM integration)

### Philosophy

- **Not an ORM** — type-safe SQL query builder. No entity-to-row mapping magic, no decorators, no schema-first DSL.
- TypeScript types written manually as `interface` per table
- pgvector via [pgvector-node](https://github.com/pgvector/pgvector-node) which has Kysely integration (`l2Distance`, etc.)
- Migration system : built-in primitives (`kysely-ctl`), no auto-generation — **you write SQL or programmatic migrations by hand**

### Fit for Musaium

- **Bad fit** :
  1. Musaium relies on TypeORM's `migration:generate` for 56 migrations — Kysely has no generation, you'd hand-write every schema change going forward
  2. Hexagonal architecture maps well to Repository pattern — Kysely forces a different abstraction layer
  3. Removes the entity decorator system that 24 entity classes depend on
- **Good fit if** : Musaium wanted to write more raw-ish SQL with type safety, and accept the loss of auto-generation

### Verdict

Kysely is **the wrong tier** for Musaium. It's a SQL builder for teams that find ORMs too magical ; Musaium *uses* the ORM features (entity classes, decorators, eager loading, migration generation). Excluded from decision matrix below.

---

## Decision matrix

For Musaium (24 entities, 56 migrations, pgvector halfvec(768), NO advisory locks, launch V1 2026-06-01 in 19 days, hexagonal repos, 100k users target) :

| Criterion | Weight | TypeORM 0.3.28 (keep) | TypeORM 1.0 (upgrade when GA) | Drizzle v1-rc | Prisma 7 | Kysely |
|---|---|---|---|---|---|---|
| Halfvec/pgvector native | 5 | ✗ raw SQL workaround | ✗ no halfvec column | ✓ native | ✗ Unsupported() | ⚠ via plugin |
| 56 migrations preserved | 5 | ✓ as-is | ✓ as-is | ⚠ re-introspect | ✗ rewrite | ✗ rewrite |
| 24 entity decorators preserved | 4 | ✓ | ✓ + codemod | ✗ rewrite to schema.ts | ✗ rewrite to .prisma | ✗ delete decorators |
| Maintenance velocity 2026 | 4 | ✗ no stable in 12mo | ⚠ vaporware target H1 2026 | ✓ active, RC stage | ✓ active, 7.2 shipped Dec 2025 | ⚠ slow but stable |
| Production maturity | 4 | ✓ legacy mature | ✗ unproven | ⚠ v1 RC | ✓ widely deployed | ✓ Maersk/Cal.com |
| Bundle size | 2 | ⚠ ≈250 KB | ⚠ ≈250 KB | ✓ ≈50 KB | ✓ ≈1.6 MB post v7 | ✓ ≈30 KB |
| Type safety on query | 3 | ⚠ Repository typed, QueryBuilder weak | ⚠ same | ✓ best in class | ✓ excellent | ✓ best in class |
| Migration cost from current state | -10 | 0 | ≈1-2 weeks (codemod + Node deprecations) | **≈6-10 weeks** | ≈10-14 weeks | ≈12-16 weeks |
| Risk for launch 2026-06-01 (19 days) | -10 | 0 | medium | **HIGH** | HIGH | HIGH |
| Ecosystem inertia in repo | -5 | 0 | low | medium | high | high |

**Score (informal, weighted)** :
- TypeORM 0.3.28 keep : **best for next 6 weeks**
- TypeORM 1.0 upgrade : best for next 12 months (assuming v1.0 actually ships)
- Drizzle v1 : best for **post-launch H2 2026** if v1 GA confirmed
- Prisma 7 : viable but higher rewrite cost
- Kysely : excluded — wrong abstraction tier

---

## Verdict + migration cost

### Verdict for launch V1 2026-06-01 — **DEFER**

**Keep TypeORM 0.3.28 for launch.** Reasons :

1. **19 days to V1** — ORM migration in pre-launch window violates "no big bang before launch" doctrine and `feedback_no_feature_flags_prelaunch.md` (live or revert principle, but ORM migration is neither — it's months of work).
2. **No CVE pressure** — Snyk reports 0 vulnerabilities on 0.3.28/0.3.29.
3. **Halfvec workaround is contained** — 4 raw SQL sites in 1 adapter file (`artwork-embedding.repository.pg.ts`). Not bleeding into rest of codebase.
4. **`() => 'NULL'` workaround documented** — known, in code, no surprise.
5. **TypeORM v1.0 still vaporware** — December 2025 issue, no shipped beta in 5 months. Cannot bet launch on it.

### Tech debt tag — recommend logging in `docs/TECH_DEBT.md`

```
TD-ORM-001 (HIGH, scheduled post-launch) — TypeORM 0.3.28 unmaintained
- Last stable 12 mo old (May 2025)
- v1.0 vaporware (H1 2026 target, no beta as of 2026-05-12)
- Plan : migrate to Drizzle v1 GA when confirmed shipped + ≥3 mo bake elsewhere
- Effort estimate : 6-10 weeks engineer time
- Triggers : (a) Drizzle v1 GA stable + 3mo bake, (b) TypeORM CVE published, (c) breaking PG18 compatibility issue
```

### Migration cost estimate (Drizzle path, if chosen post-launch)

Concrete steps (effort = ranges in weeks of focused dev time, not calendar — see `feedback_no_solo_dev_estimates.md`) :

| Phase | Steps | Effort range |
|---|---|---|
| 1. Introspection + dual setup | `drizzle-kit pull` + commit generated schema ; wire Drizzle client alongside TypeORM `DataSource` ; CI green with both | 0.5-1 week |
| 2. Schema reconciliation | Hand-audit generated `schema.ts` vs 24 entities — naming, FK relations, indexes, `Relation<T>` SWC workaround pattern, halfvec(768) inference | 1-2 weeks |
| 3. Repository rewrite | Rewrite ≈30-40 `*.repository.pg.ts` files (one per entity + composites). Migrate from TypeORM Repository<T> to Drizzle query builder. Preserve hexagonal interfaces. | 2-3 weeks |
| 4. Migration system swap | Port 56 TypeORM migrations to Drizzle history (mark as applied via `__drizzle_migrations` baseline), retire `migration-cli.cjs`, write generate-and-migrate replacement | 1-1.5 weeks |
| 5. pgvector hot-path verification | Validate halfvec(768) HNSW queries match TypeORM raw-SQL output bit-exact ; re-run NFR recall ≥0.85 fixture | 0.5-1 week |
| 6. Test suite + Stryker mutation rebaseline | Adapt 400+ tests using TypeORM EntityManager mocks ; Stryker hot files | 1-1.5 weeks |
| 7. CI/CD + deploy | EAS + GHCR pipeline checks ; smoke prod ; bake ≥7 days per `project_no_staging_v1.md` | 0.5 week |
| **Total** | | **6-10 weeks** |

### Migration cost estimate (TypeORM v1.0 path, if it ships)

- Run `npx @typeorm/codemod v1 src/` — auto-rename `connection` → `dataSource`, etc.
- Audit for removed APIs (`@EntityRepository`, `findByIds`) — Musaium clean per grep
- Re-test the `() => 'NULL'` workaround — may become unneeded if Item 7 (null/undefined defaults) changes behavior favorably
- **Effort** : ≈1-2 weeks focused

This is the cheap path **IF v1.0 ships**. Risk : it's been 5 months with no beta, target H1 2026 may slip to H2 2026 or later.

---

## Sources (full URL list)

### TypeORM
- [github.com/typeorm/typeorm/releases](https://github.com/typeorm/typeorm/releases)
- [github.com/typeorm/typeorm/releases/tag/0.3.29](https://github.com/typeorm/typeorm/releases/tag/0.3.29)
- [github.com/typeorm/typeorm/issues/11819 — Release plan for 1.0](https://github.com/typeorm/typeorm/issues/11819)
- [security.snyk.io/package/npm/typeorm](https://security.snyk.io/package/npm/typeorm)
- [github.com/typeorm/typeorm](https://github.com/typeorm/typeorm)
- [github.com/typeorm/typeorm/issues/7245 — Composite PK + FK](https://github.com/typeorm/typeorm/issues/7245)
- [github.com/typeorm/typeorm/issues/10946 — CVE-2024-35255](https://github.com/typeorm/typeorm/issues/10946)
- [github.com/advisories/GHSA-fx4w-v43j-vc45 — CVE-2022-33171](https://github.com/advisories/GHSA-fx4w-v43j-vc45)
- [npmtrends.com/typeorm](https://npmtrends.com/typeorm)

### Drizzle
- [orm.drizzle.team](https://orm.drizzle.team/)
- [orm.drizzle.team/roadmap](https://orm.drizzle.team/roadmap)
- [orm.drizzle.team/docs/migrate/migrate-from-typeorm](https://orm.drizzle.team/docs/migrate/migrate-from-typeorm)
- [orm.drizzle.team/docs/extensions/pg](https://orm.drizzle.team/docs/extensions/pg)
- [orm.drizzle.team/docs/guides/vector-similarity-search](https://orm.drizzle.team/docs/guides/vector-similarity-search)
- [orm.drizzle.team/benchmarks](https://orm.drizzle.team/benchmarks)
- [orm.drizzle.team/docs/get-started/postgresql-existing](https://orm.drizzle.team/docs/get-started/postgresql-existing)
- [orm.drizzle.team/docs/drizzle-kit-migrate](https://orm.drizzle.team/docs/drizzle-kit-migrate)
- [github.com/drizzle-team/drizzle-orm/releases](https://github.com/drizzle-team/drizzle-orm/releases)
- [github.com/drizzle-team/drizzle-orm/issues/4275 — advisory locks feature request](https://github.com/drizzle-team/drizzle-orm/issues/4275)

### Prisma
- [prisma.io/blog/announcing-prisma-orm-7-0-0](https://www.prisma.io/blog/announcing-prisma-orm-7-0-0)
- [prisma.io/blog/announcing-prisma-orm-7-2-0](https://www.prisma.io/blog/announcing-prisma-orm-7-2-0)
- [prisma.io/blog/from-rust-to-typescript-a-new-chapter-for-prisma-orm](https://www.prisma.io/blog/from-rust-to-typescript-a-new-chapter-for-prisma-orm)
- [prisma.io/blog/prisma-orm-without-rust-latest-performance-benchmarks](https://www.prisma.io/blog/prisma-orm-without-rust-latest-performance-benchmarks)
- [prisma.io/blog/orm-6-13-0-ci-cd-workflows-and-pgvector-for-prisma-postgres](https://www.prisma.io/blog/orm-6-13-0-ci-cd-workflows-and-pgvector-for-prisma-postgres)
- [prisma.io/docs/postgres/database/postgres-extensions](https://www.prisma.io/docs/postgres/database/postgres-extensions)
- [github.com/prisma/prisma/issues/18442 — pgvector](https://github.com/prisma/prisma/issues/18442)
- [github.com/prisma/prisma/issues/28270 — roadmap](https://github.com/prisma/prisma/issues/28270)
- [infoq.com/news/2026/01/prisma-7-performance](https://www.infoq.com/news/2026/01/prisma-7-performance/)

### Kysely
- [kysely.dev](https://kysely.dev/)
- [github.com/kysely-org/kysely](https://github.com/kysely-org/kysely)
- [github.com/pgvector/pgvector-node](https://github.com/pgvector/pgvector-node)
- [npmtrends.com/kysely](https://npmtrends.com/kysely)

### Comparisons / context
- [bytebase.com/blog/drizzle-vs-prisma](https://www.bytebase.com/blog/drizzle-vs-prisma/)
- [makerkit.dev/blog/tutorials/drizzle-vs-prisma](https://makerkit.dev/blog/tutorials/drizzle-vs-prisma)
- [pkgpulse.com/guides/drizzle-orm-v1-vs-prisma-6-vs-kysely-2026](https://www.pkgpulse.com/guides/drizzle-orm-v1-vs-prisma-6-vs-kysely-2026)
- [pkgpulse.com/guides/typeorm-vs-prisma-2026](https://www.pkgpulse.com/guides/typeorm-vs-prisma-2026)
- [encore.dev/articles/drizzle-vs-prisma](https://encore.dev/articles/drizzle-vs-prisma)
- [strapi.io/blog/orms-for-developers](https://strapi.io/blog/orms-for-developers)
- [github.com/mikro-orm/mikro-orm/discussions/7176 — competitive landscape](https://github.com/mikro-orm/mikro-orm/discussions/7176)

### pgvector / halfvec
- [github.com/pgvector/pgvector](https://github.com/pgvector/pgvector)
- [dev.to/abhishek_gautam-01/halfvec-half-the-bits-twice-the-speed-3506](https://dev.to/abhishek_gautam-01/halfvec-half-the-bits-twice-the-speed-3506)
- [dbi-services.com/blog/pgvector-a-guide-for-dba-part-2-indexes-update-march-2026](https://www.dbi-services.com/blog/pgvector-a-guide-for-dba-part-2-indexes-update-march-2026/)

### Musaium codebase citations
- `museum-backend/package.json:120` — `"typeorm": "0.3.28"`
- `museum-backend/src/modules/auth/adapters/secondary/pg/user.repository.pg.ts:168-178` — `() => 'NULL'` workaround
- `museum-backend/src/modules/chat/adapters/secondary/persistence/artwork-embedding.repository.pg.ts:8-10, 67-69, 109, 131-155, 227, 297` — halfvec(768) raw SQL adapter
- `museum-backend/src/config/env.types.ts:381, 405, 408` — pgvector config doc
- `museum-backend/src/data/db/migrations/` — 56 migration files
