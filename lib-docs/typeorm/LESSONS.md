# Lessons — typeorm

Projet-specific gotchas pour TypeORM 0.3.x dans Musaium. Édité manuellement (humans only — agents read-only). Issu de l'audit enterprise-grade 2026-05-18 (sampled 37/131 consumers).

## 2026-05-08 — Infinite loop on prune cron saturating prod DB
- **Symptôme** : retention cron (support, reviews, art-keywords) ne sortait jamais de la boucle `while (chunkDeleted !== 0)`, saturant prod (incident 2026-05-08).
- **Cause** : TypeORM 0.3.x normalise le `raw` retour de `dataSource.query("DELETE … RETURNING")` en tuple `[rows: unknown[], rowCount: number]` (cf. `PostgresQueryRunner.js raw.command switch`). Le code utilisait `result.length` (toujours 2) au lieu de `result[1]` → décrément jamais nul → loop infini.
- **Fix** : typer le retour `query<[unknown[], number] | undefined>` puis `Array.isArray(result) && typeof result[1] === 'number' ? result[1] : 0`. Ou utiliser `.createQueryBuilder().delete().execute()` qui retourne `DeleteResult.affected`.
- **Anti-pattern à éviter** : `(result as unknown[]).length` pour compter les rows affectés d'un `DELETE … RETURNING`.
- **Ref** : `museum-backend/src/modules/support/useCase/retention/prune-support-tickets.ts:42`, `museum-backend/src/modules/review/useCase/moderation/prune-reviews.ts:55`, `museum-backend/src/modules/chat/useCase/prune-stale-art-keywords.ts:52`, `museum-backend/src/shared/audit/audit-ip-anonymizer.job.ts:15`.

## 2026-05 — verifyEmail/resetToken replay vulnerability after `.set({field: undefined})`
- **Symptôme** : tokens "consumed" laissés intacts → replays POST-verify, POST-reset acceptaient le même token deux fois.
- **Cause** : `UpdateQueryBuilder.set({field: undefined})` ne génère AUCUN `SET field = …` (silent skip). Idem pour `repo.update(criteria, { field: undefined })` qui forwarde vers `EntityManager.update` → même code path interne.
- **Fix** : forcer le clear via raw expression `() => 'NULL'` (e.g. `verification_token: () => 'NULL'`), ou pré-filtrer `undefined` côté caller avec un `Partial<Entity>` accumulateur.
- **Anti-pattern à éviter** : passer `field: undefined` à `.set()` ou `repo.update()` en pensant que ça écrira NULL. Pour clear, soit `() => 'NULL'` (QueryBuilder) soit littéral `null` (Repository.update).
- **Ref** : `museum-backend/src/modules/auth/adapters/secondary/pg/user.repository.pg.ts:89,117,162,195`. ESLint rule `musaium-test-discipline/no-typeorm-set-undefined` enforce no regression.

## 2026-05-18 — Cross-entity FK SANS Relation<T> = SWC/ESM ReferenceError circular
- **Symptôme** : `ReferenceError: Cannot access 'User' before initialization` au boot SWC, ou type circular sous ESM.
- **Cause** : décorateurs `@ManyToOne(() => Other)` + champ `other: Other` créent un cycle d'import résolu par TypeORM via `Relation<T>` (le type alias casse la circularité TypeScript).
- **Fix** : toujours `import type { Relation } from 'typeorm'` + typer `other!: Relation<Other>` (ou `Relation<Other>[]` pour `@OneToMany`).
- **Anti-pattern à éviter** : typer la propriété de relation avec le type brut (`user!: User`) — fonctionne souvent en dev sous tsc mais casse sous SWC/Bundlers.
- **Ref** : `museum-backend/src/modules/chat/domain/message/chatMessage.entity.ts:27`, `museum-backend/src/modules/chat/domain/session/chatSession.entity.ts:26`, `museum-backend/src/modules/auth/domain/refresh-token/authRefreshToken.entity.ts:23`. **Audit 2026-05-18 confirme conformité 14/14 sites**.

## 2026-05 — Audit chain cluster-wide `pg_advisory_xact_lock` cap les INSERT à 50-200/s
- **Symptôme** : sous charge 100k MAU prévue V2, throughput audit INSERT saturé (~150/s).
- **Cause** : `audit.repository.pg.ts` prend `pg_advisory_xact_lock(GLOBAL_KEY)` au début de CHAQUE INSERT (chain hash impose sérialisation virtuelle). Lock transaction-scoped donc PgBouncer-tx compatible MAIS sérialise toutes les insertions audit cluster-wide.
- **Fix** : ADR-054 planifie un Merkle batch redesign post-V1. Pas de change pré-launch.
- **Anti-pattern à éviter** : ne pas chercher à scaler en parallélisant les writers — la lock est définitionnelle pour la chain hash. Tout patch "throughput" passe par changer la structure (batch + Merkle), pas par toucher au lock.
- **Ref** : `museum-backend/src/shared/audit/audit.repository.pg.ts:14,36,54`.

## 2026-05-18 — Soft-delete hand-rolled (no `@DeleteDateColumn`) — caller MUST filter `deletedAt` manuellement
- **Symptôme** : risque latent de leak d'utilisateurs/sessions "soft-deleted" dans queries qui n'ajoutent pas `WHERE deletedAt IS NULL`.
- **Cause** : `User.deletedAt` et `ChatSession.purgedAt` sont déclarés `@Column` (non `@DeleteDateColumn`). Aucun filtre automatique TypeORM, `findOne`/`find` retournent les rows soft-deleted. Auth filtre post-fetch (`authSession.service.ts:103,185`), admin filtre via `qb.andWhere('u.deleted_at IS NULL')`. Si un nouveau caller oublie le filtre = soft-deleted user remonte.
- **Fix** : voir TD-TO-01 dans `docs/TECH_DEBT.md` (migration vers `@DeleteDateColumn` + `softRemove()`).
- **Anti-pattern à éviter** : ajouter un nouveau use case qui lit `users` sans `deletedAt IS NULL` filter.
- **Ref** : `museum-backend/src/modules/auth/domain/user/user.entity.ts:140`, `museum-backend/src/modules/chat/domain/session/chatSession.entity.ts:72`.

## Test isolation : transaction-rollback pattern
- **Symptôme** : N/A (note d'orientation testing).
- **Cause** : PATTERNS.md §7.2 documente le pattern `dataSource.transaction(em => { ... throw new Rollback })` comme isolation per-test ; pas systématiquement utilisé dans `tests/integration/**`.
- **Fix** : créer helper `withTxRollback` dans `tests/helpers/db.ts`.
- **Anti-pattern à éviter** : truncate/delete cascade manuel entre tests, lent et fragile.
- **Ref** : `PATTERNS.md:253`.

## 2026-05-20 — Refresh
- Re-fetched upstream sources (release notes 0.3.29 + 0.3.30 + 1.0.0, GitHub Security Advisories) against pinned 0.3.28.
- **No new gotchas discovered in the Musaium codebase.** Audit covered all `museum-backend/src/**/*.repository*.ts`, `src/**/*.repo.ts`, `src/data/db/migrations/*.ts`:
  - `.set({field: undefined})` — 0 violations (existing fixes hold; ESLint rule `musaium-test-discipline/no-typeorm-set-undefined` enforces).
  - `repo.update(_, { field: undefined })` — 0 violations.
  - Raw template interpolation with user input into QueryBuilder `where()` — 0 violations.
  - `eager: true` / `cascade: true` — 0 occurrences.
  - Empty `{}` criteria in `.delete()` / `.update()` — 0 occurrences.
- **PATTERNS.md regenerated** (sha256 `d97f9ca9a5b01873b4928865c5319966bc3ffdf4ec3e8f07232b9f99a38de039`) — expanded to cover §3.3 update flows (3 shapes), §4.10–§4.13 new anti-patterns (DELETE RETURNING tuple, Relation<T>, raw interpolation, empty criteria post-0.3.23), §7.2 SAVEPOINT integration-harness guard, §7.3 pgvector halfvec migrations.
- **Security context (0.3.28 vs latest)** : 0.3.29 ships `fix(security): validate limit() in Update/SoftDelete query builders` (no CVE assigned). Musaium exposure: LOW — grep confirms zero call site forwards user input into `.limit()` on update/soft-delete builders. Patch upgrade to 0.3.30 still recommended pre-launch (small surface, no breaking change).
- **Major 1.0.0 (2026-05-19)** : drops Node 16/18 — Musaium runs Node 22, compatible. Defer upgrade to Q3 2026 post-launch (frozen window).
- **JsonContains array values** : fixed in 0.3.30 (broken in 0.3.28). No current call site uses `JsonContains` with arrays — but documented in PATTERNS §3.10 as the canonical workaround on 0.3.28 (`Raw(alias => \`${alias} @> :j::jsonb\`, …)`).
- PATTERNS.md verified against snapshots `snapshot-2026-05-18.md` + `snapshot-2026-05-20.md` (both retained, both referenced in header).
