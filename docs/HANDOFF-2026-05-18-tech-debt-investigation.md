# Handoff 2026-05-18 → 2026-05-19 : Tech-debt × worktree collision investigation

## Pourquoi ce doc

Le 2026-05-18, on a bootstrappé `lib-docs/` UFR-022 + lancé un audit enterprise-grade des 54 libs (reviewer.md fresh-context par lib). Résultat : **88 nouvelles entrées TD** dans `docs/TECH_DEBT.md` (section "# Audit lib-docs enterprise 2026-05-18 (UFR-022 batch)"), dont **21 BLOCKERS pre-V1** et **25 HIGH**.

**Avant de lancer les fixes** : 4 worktrees parallèles (`audit-360-w1..w4`) sont en cours. Travailler sur les TDs maintenant risque d'être effacé/conflicté au merge → waste. Cette investigation classifie chaque TD selon collision avec les worktrees pending.

## Ce qui est déjà committé (durable, survit à la session)

- Commit `685bc45c` sur `main` : 56 files, 3786 insertions
  - `docs/TECH_DEBT.md` : +900 lignes, 88 TD entries section bas
  - `lib-docs/INDEX.json` : 105 entrées (54 direct + 51 collapse stubs)
  - 53 `lib-docs/<lib>/LESSONS.md`
  - `.gitignore` patch pour scoped LESSONS.md
- Lib-docs cache local 3.3 MB (snapshots/PATTERNS.md untracked per `.gitignore`)
- GitNexus index **stale** (5a01f5c → 685bc45c) — `npx gitnexus analyze` requis si refresh souhaité

## Worktrees actifs (à investiguer demain)

| Worktree | Branche | HEAD | Probable scope |
|---|---|---|---|
| `/Users/Tim/Desktop/all/dev/Pro/InnovMind` | main | 685bc45c | base + TECH_DEBT |
| `InnovMind-W1` | `feat/audit-360-w1-chat-hardening` | 6a4a1fd2 | chat module — collision probable avec TD-RHF, TD-REACT, TD-LF, TD-LC, TD-EX |
| `InnovMind-W2` | `feat/audit-360-w2-ai-safety-voice` | 2e9b81bd | AI safety + voice — collision probable avec TD-LC, TD-LF, TD-EX (chat-route), TD-SHARP |
| `InnovMind-W3` | `feat/audit-360-w3-geo-walk-intra` | f687b600 | geo + intra-museum — collision possible avec TD-RNGH (map gestures), TD-NI (netinfo) |
| `InnovMind-W4` | `feat/audit-360-w4-compliance-ops-release` | c8c5db92 | compliance + ops — collision TRÈS probable avec TD-SN, TD-SNXT, TD-OTEL, TD-PC, TD-HEL, TD-SSL |

**Hypothèse forte** : W4 contient probablement déjà du travail sur Sentry/OTel/Helmet/cert-pinning → plusieurs de mes TDs sont peut-être **STALE** parce que déjà fixés là-bas. Vérifier avant tout.

## Mission demain

Classifier chaque TD en 4 catégories :
- **SAFE-NOW** : aucun worktree ne touche les Evidence files → fix possible sur main
- **WAIT-FOR-MERGE** : worktree touche Evidence files mais fix complémentaire/compatible → attendre merge puis re-audit
- **STALE-IN-WORKTREE** : worktree a déjà résolu la deviation → marquer stale dans `docs/TECH_DEBT.md`, pas de fix
- **COLLISION-RISK** : worktree modifie Evidence files de façon ambiguë → MERGE FIRST puis re-audit obligatoire

## Acceptance

À la fin, lire `docs/HANDOFF-2026-05-19-debt-collision-report.md` doit donner clairement :
1. Worktrees à merger EN PREMIER (ordre + raison)
2. TDs SAFE-NOW prêts à lancer /team (par cluster)
3. TDs STALE à marquer dans `docs/TECH_DEBT.md`
4. TDs COLLISION-RISK qui exigent MERGE → RE-AUDIT

## 12 clusters de TD identifiés hier (référence)

| # | Cluster | TD IDs | Files probables |
|---|---|---|---|
| 1 | Sentry observability BE | TD-SN-01/02/03/04 | `museum-backend/src/shared/observability/{sentry,opentelemetry}.ts` |
| 2 | Sentry observability Web | TD-SNXT-01/02/03/04 | `museum-web/sentry.*.config.ts`, `next.config.ts` |
| 3 | Sentry observability Mobile | TD-SRN-01 | `museum-frontend/metro.config.js` |
| 4 | prom-client security | TD-PC-01/02 | `museum-backend/src/shared/observability/{prometheus-metrics,metrics-middleware}.ts`, nginx |
| 5 | JWT + Auth rate-limit | TD-JWT-01, TD-EX-01 | `museum-backend/src/modules/auth/.../google-oauth-state.ts`, 7 route files |
| 6 | Helmet CSP | TD-HEL-01/02/03 | `museum-backend/src/app.ts` |
| 7 | React forms validation | TD-RHF-01/02/03, TD-REACT-01 | `museum-frontend/app/auth.tsx`, `useSessionLoader.ts` |
| 8 | RN gestures + modals | TD-RNGH-01/02/03/04 | `museum-frontend/app/_layout.tsx`, `ArtworkHeroModal.tsx` |
| 9 | Mobile cert pinning | TD-SSL-01/02/03/04/05 | `museum-frontend/app.config.ts`, `cert-pinning*` |
| 10 | Markdown LLM links security | TD-MD-01/02/03/04 | `useChatSessionActions.ts`, `chatSessionLogic.pure.ts` |
| 11 | i18n AR-launch | TD-I18N-01/02/03/04/05 | `museum-frontend/index.js`, `ar/translation.json`, `carnet/[sessionId].tsx` |
| 12 | Web deps codemods | TD-MGL-01, TD-FM-01 | `museum-web/src/components/marketing/*.tsx`, `package.json` |

## Open questions pendantes (décisions business avant fix)

- **ADR-045** : Sentry+OTel coexistence est-il intentionnellement half-implémenté (errors-only mode) OU bug ? TD-SN-01 dépend de cette clarification.
- **AR launch date** : i18n cluster TD-I18N-01/02/03 bloque AR. Si AR pas roadmap V1 → ces TDs deviennent NICE_TO_HAVE post-launch, pas BLOCKER.
- **CSP report endpoint** : décision pre-V1 ou post-launch ? TD-HEL section "polish" mentionne `report-to` directive.
- **GestureHandlerRootView mount** : confirmer que les pinch-zoom + Swipeable fonctionnent EFFECTIVEMENT en preview iOS New Arch (TD-RNGH-01/02). Peut-être Expo Router auto-wrap dans une version récente → testing requis avant fix.

## Pointers vers le travail d'hier

- Bootstrap exec details : `lib-docs/README.md` + `lib-docs/INDEX.json` + per-lib `LESSONS.md`
- Audit findings : `docs/TECH_DEBT.md` section "# Audit lib-docs enterprise 2026-05-18 (UFR-022 batch)" (ligne ~770 à la fin)
- Clusters table : ici, section "12 clusters de TD identifiés hier"
- Commit : `git show 685bc45c --stat`
