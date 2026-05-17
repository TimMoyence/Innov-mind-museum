# Audit-360 S1 — Commit guide

**Pour le user au matin** : commits par scope task, dans cet ordre. Le worktree = `/Users/Tim/Desktop/all/dev/Pro/InnovMind-audit-360-s1/` branche `worktree-feat+audit-360-s1`.

> ⚠️ **Avant tout commit** : `git status` doit montrer les fichiers attendus par task. Les hooks pre-commit (gates 1-6) tournent normalement, ne PAS bypass (UFR-020).

---

## Ordre recommandé (10 commits — tasks done, hors obsolete)

### Commit 1 — T1.2 (NO-OP, juste tracking documentation)

Pas de commit code — la task était OBSOLETE (déjà shipped par `d23a1bb8b` + `baa14c227`). Documenté en tracking.md + specs/T1.2.md. Si tu veux pousser ces fichiers, fais-le dans le commit final orchestrator (étape 11).

### Commit 2 — T1.3 (docs/TECH_DEBT.md TD-16 add)

```bash
git add docs/TECH_DEBT.md
git commit -m "$(cat <<'EOF'
docs(audit-s1,T1.3): add TD-16 noUncheckedIndexedAccess BE

Documente le défer pré-launch de l'activation noUncheckedIndexedAccess côté
museum-backend (35-50 sites estimés, 8-12h effort) avec deadline post-V1
sprint 1. Empêche le drift silencieux post-launch.

Source : audit-360 S1 § 4.2 + specs/T1.3.md
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Commit 3 — T1.8 (docs/audit-2026-05-12/MASTER.md reflag 4 cellules)

```bash
git add docs/audit-2026-05-12/MASTER.md
git commit -m "$(cat <<'EOF'
docs(audit-s1,T1.8): reflag 4 stale entries 05-12 (P0-7, P1-1, P2-6, P2-7)

- P0-6 : déjà ✅ RESOLVED 2026-05-14 (no-op)
- P0-7 : ✅ RESOLVED 2026-05-16 (zombie exports supprimés, api.ts:34-48 legitime)
- P1-1 : ✅ RESOLVED 2026-05-16 (sentry-scrubber centralisé via @musaium/shared)
- P2-6 : ✅ RESOLVED 2026-05-16 (per S1 dryskiss § 5.5)
- P2-7 : ❌ INCORRECT — Web tsconfig l'a (noUncheckedIndexedAccess: true)

Source : audit-360 S1 § 8 + specs/T1.8.md
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Commit 4 — T1.4 (BE ESLint v10 → v9 downgrade + TD-7 update + lockfile)

```bash
git add museum-backend/package.json museum-backend/pnpm-lock.yaml docs/TECH_DEBT.md
git commit -m "$(cat <<'EOF'
chore(audit-s1,T1.4): align BE ESLint to v9.39.4 (path b — alignment-down)

Path (a) FE/Web → v10 bloqué upstream (jsx-eslint/eslint-plugin-react#3977
peer eslint ^9.7 max, runtime fail context.getFilename() removed in v10).
Path (b) BE descend à v9.39.4 : 2 lignes package.json, lockfile regen,
TD-7 statut update + correction jsdoc claim FAUX (cascade jsdoc<62.7
non nécessaire, vérifié peer = ^7..^10 toutes versions 62.x).

PAS d'ADR-053 créé (collision ADR-050 déjà — TD-7 = ticket vivant).
Hooks : BE lint exit 0 (eslint v9 + lint:test-discipline + tsc), as-any 0/0/0.

Source : audit-360 S1 + specs/T1.4.md
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

> ⚠️ **Note** : TECH_DEBT.md est aussi touché par T1.3 (TD-16 add). Si tu commits T1.3 d'abord puis T1.4, TD-7 update + TD-16 add seront dans des commits séparés. Si tu préfères regrouper TECH_DEBT, fais-le après T1.3 + T1.4 en un seul commit.

### Commit 5 — T1.5 (packages/musaium-shared cull + lockfiles consistency)

```bash
# Files to delete (5 sub-dirs src/ + dist/)
git add -A packages/musaium-shared/
# Lockfiles : FE + BE (musaium-shared 0.1.0 → 0.2.0 sync)
git add museum-frontend/package-lock.json
# Note : museum-backend/pnpm-lock.yaml déjà inclus dans T1.4 commit
git commit -m "$(cat <<'EOF'
chore(audit-s1,T1.5): cull 5 phantom sub-exports from @musaium/shared

Path (a) cull (UFR-016 bury_dead_code) :
- Remove src/ + dist/ : geo, auth, errors, i18n, validation (0 consumer)
- Reduce src/index.ts to single `export * from './observability'`
- package.json : bump 0.1.0 → 0.2.0, exports trimmed to . + ./observability,
  description narrowed to observability-only
- CHANGELOG.md created with 0.2.0 + 0.1.0 entries

observability sub-package preserved (3 live consumers : BE root barrel,
FE + Web path-style — sentry-scrubber centralization confirmé par T1.8 P1-1).
Lockfile FE updated to musaium-shared 0.2.0 (mechanical sync via npm install).

Source : audit-360 S1 § 5.3 + specs/T1.5.md
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Commit 6 — T1.6 (NO-OP documentation only)

Pas de commit code — task OBSOLETE (commit `968cdafad` 2026-05-13 déjà fait). Documenté en tracking + specs/T1.6.md. Sera dans le commit final orchestrator (étape 11).

### Commit 7 — T1.1 (REVERTED rename, juste P1-7 reflag dans MASTER + OVERNIGHT)

```bash
git add docs/audit-2026-05-12/MASTER.md docs/audit-2026-05-12/OVERNIGHT_P1_REPORT.md
git commit -m "$(cat <<'EOF'
docs(audit-s1,T1.1): reflag P1-7 langfuse RESOLVED via ADR-050

T1.1 inspection a découvert que langfuse v3 EOL était déjà résolu par
ADR-050 (commit 96526b03 du 2026-05-13). Original plan = rename ADR-050→052
pour résoudre la collision triplicity, MAIS S2 T-S2-2 (commit 3095bf434
déjà mergé main) a résolu différemment : langfuse=050 (kept), oss-guardrail=051,
user-suspend=052. T1.1 rename REVERTED 2026-05-17 pour éviter re-collision.

Reste de T1.1 préservé pour traçabilité doctrine :
- MASTER.md L71 : P1-7 ✅ RESOLVED 2026-05-13 + ref ADR-050 + note "audit-360 S1 T1.1 reflag 2026-05-16"
- OVERNIGHT_P1_REPORT.md L27 : note T1.1 reflag + collision deferred to S2

Net diff = 2 lignes documentaires.

Source : audit-360 S1 + specs/T1.1.md
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

> ⚠️ **Note** : MASTER.md est touché par T1.8 (4 cellules) + T1.1 (P1-7 cellule). Si tu commits T1.8 d'abord puis T1.1, OK. Sinon regroupe en 1 commit `docs(audit-s1,T1.8+T1.1)`.

### Commit 8 — T1.7 (5 BE sites cleanup + 5 helpers/tests)

```bash
git add museum-backend/src/shared/semaphore.ts \
        museum-backend/src/modules/chat/useCase/guardrail/guardrail-evaluation.service.ts \
        museum-backend/src/modules/museum/adapters/secondary/enrichment/typeorm-museum-enrichment-cache.adapter.ts \
        museum-backend/src/data/db/data-source.ts \
        museum-backend/src/modules/auth/adapters/secondary/social/social-otc-store.ts \
        museum-backend/tests/unit/chat/semaphore.test.ts \
        museum-backend/tests/unit/chat/guardrail-evaluation-service.test.ts \
        museum-backend/tests/unit/auth/social-otc-store.test.ts \
        museum-backend/tests/unit/museum/typeorm-museum-enrichment-cache.adapter.test.ts \
        museum-backend/tests/unit/data/db/start-pool-monitor.test.ts
git commit -m "$(cat <<'EOF'
refactor(audit-s1,T1.7): 5 BE 'as unknown as' → typed helpers + tests

5 sites cleaned (audit P1 deferrable) :
1. semaphore.ts:86 (timeout fallback) → `as never`
2. guardrail-evaluation.service.ts:498 (metadata cast) → inline `{ ...metadata }` spread
3. typeorm-museum-enrichment-cache.adapter.ts:156 (cache value cast) → `parsedToJsonb` rewrite
4. data-source.ts:95 (driver introspection) → exported `hasPgPool` predicate
5. social-otc-store.ts:125 (`as TPayload`) → Zod schema injection (defense in-depth)

+18 tests : 1+1+3 in modified + 13 in 2 new files
(typeorm-museum-enrichment-cache.adapter.test.ts, start-pool-monitor.test.ts).

Sentinel as-any maintenu 0/0/0 (sentinel match `as any`, pas `as unknown as` —
T1.7 = type-safety dette volontaire, pas blocker CI).

Source : audit-360 S1 + specs/T1.7.md (5 sites détaillés)
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

> ⚠️ **Note** : `guardrail-evaluation.service.ts` est touché par T1.7 (site 2 inline spread) ET T1.11 (split refactor). Si tu commits T1.7 avant T1.11, OK. T1.11 commit isolera ses changes (extractions vers eval/).

### Commit 9 — T1.9 (FE shared/lib/env.ts + 4 sites + CLAUDE.md + 2 ast-grep rules)

```bash
git add museum-frontend/shared/lib/env.ts \
        museum-frontend/app.config.ts \
        museum-frontend/app/_layout.tsx \
        museum-frontend/shared/infrastructure/apiConfig.ts \
        museum-frontend/shared/infrastructure/cert-pinning-init.ts \
        CLAUDE.md \
        tools/ast-grep-rules/use-readenv-helper.yml \
        tools/ast-grep-rules/use-readenv-helper-tsx.yml
git commit -m "$(cat <<'EOF'
refactor(audit-s1,T1.9): adopt canonical readEnvString helper FE

Unifie 3 helpers env locaux (typeofString, trimOrUndefined, readEnvString
locaux) en un seul `readEnvString` exporté depuis museum-frontend/shared/lib/env.ts.
Pattern : trim + length>0 check (matches dominant trimOrUndefined behavior).

- 4 sites importent canonical : app.config.ts, _layout.tsx, apiConfig.ts,
  cert-pinning-init.ts
- 5ème site `features/chat/infrastructure/chatApi/_internals.ts` PAS touché
  (anti-collision chat-ux branch — explicitement allowlisté ast-grep rule
  avec TODO post-merge)
- CLAUDE.md gotcha "process.env.X local vs CI" updated pour pointer le helper
  réel (UFR-013 — doc doit suivre code, ancien `typeofString` mention était
  partiellement fausse car 1 def app.config.ts + 0 cross-site usage)
- 2 ast-grep rules (.ts + .tsx grammar split) flag tout `process.env.X` non
  wrappé hors allowlist — 0 violation actuelle

Hooks : FE npm run lint exit 0.

Source : audit-360 S1 + specs/T1.9.md
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Commit 10 — T1.11 (BE guardrail split 611L → 381L)

```bash
git add museum-backend/src/modules/chat/useCase/guardrail/
git commit -m "$(cat <<'EOF'
refactor(audit-s1,T1.11): split guardrail-evaluation.service.ts 611L → 381L

Extract 4 helpers stateless (ADR-015 doctrine V1/V2 indépendance préservée
via deps en args) :
- guardrail-evaluation.types.ts (4 interfaces, re-exported par service.ts)
- eval/v2-layers.helper.ts (runLlmJudge + evaluateGuardrailProvider)
- eval/output-classifier.helper.ts (runArtTopicClassifier + aggregateOutputText)
- eval/bias-metrics.helper.ts (recordBiasMetrics + resolveLocaleLabel + KNOWN_LOCALES set)

UFR-018 catch : audit YAML claim "2 méthodes >100L" était FAUX (largest 93L).
Real refactor = 4 extractions ciblées pour atteindre ≤400L (target spec AC).

5 consumers du service untouched (aucun deep-import des helpers extraits —
single import surface preserved).

Hooks : BE lint exit 0, guardrail-evaluation-service tests 50 it PASS.

Source : audit-360 S1 + specs/T1.11.md
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Commit 11 — T1.10 (FE react-query bump)

```bash
git add museum-frontend/package.json museum-frontend/package-lock.json
git commit -m "$(cat <<'EOF'
chore(audit-s1,T1.10): bump @tanstack/react-query 5.99.2 → 5.100.10

Patches accumulés (~7 versions behind hors auto-merge Renovate). Minor bump
peu risqué : 10 consumers FE, APIs étroites (useQuery, useMutation,
useQueryClient, keepPreviousData, PersistQueryClientProvider — pas de
useInfiniteQuery/useSuspenseQuery).

Aussi bumped @tanstack/react-query-persist-client à même version (peer dep).
Lockfile sync musaium-shared 0.2.0 (mechanical via npm install).

Hooks : npm install exit 0 (0 vuln), FE npm run lint exit 0, FE npm test
267 suites / 2825 tests PASS.

Source : audit-360 S1 + specs/T1.10.md
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Commit 12 — Orchestrator artefacts (specs + reviews + tracking)

```bash
git add docs/roadmap-night/audit-360-2026-05-16/
git commit -m "$(cat <<'EOF'
docs(audit-s1): orchestrator artefacts (specs + reviews + tracking)

10 specs (T1.1-T1.12, T1.2/T1.6 = obsolete via inspection UFR-018) +
N reviews JSON 5-axis + tracking.md + COMMIT_GUIDE.md.

Run audit-360 S1 = 12 tasks pipelined :
- 2 obsolete (T1.2 P0-8 shipped pre-audit, T1.6 P1-6 fixed pre-audit)
- 10 executed avec verdict APPROVED ≥85
- 1 cross-wave collision résolue (T1.1 ADR rename reverted vs S2 main)
- 4 UFR-018 catches (T1.2 obsolete, T1.4 TD-7 jsdoc FAUX, T1.6 obsolete,
  T1.9 typeofString existe en réalité, T1.11 méthodes >100L claim FAUX)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Vérifications finales (à faire APRÈS tous les commits)

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind-audit-360-s1

# Hooks tous PASS
git status                                                 # working tree clean
node scripts/sentinels/as-any-ratchet.mjs                  # 0/0/0
node scripts/sentinels/workspace-links.mjs                 # PASS
cd museum-backend && pnpm lint && cd ..                    # exit 0
cd museum-frontend && npm run lint && cd ..                # exit 0
cd museum-web && pnpm lint && cd ..                        # exit 0

# Optionnel : run tests scopés sur fichiers touchés
cd museum-backend && pnpm test -- semaphore guardrail-evaluation typeorm-museum-enrichment-cache start-pool-monitor social-otc-store
cd museum-frontend && npm test
```

## Merge to main

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
git fetch --all
git checkout main && git pull
git merge worktree-feat+audit-360-s1
# Conflits attendus : aucun (revert T1.1 a éliminé le conflict ADR)
# Si conflit CLAUDE.md surface GitNexus stat refresh — accept current main.
```

Optionnel : créer PR au lieu de merge direct si tu veux ultrareview externe.
