# Formation — la semaine du 21 au 28 mai 2026

> Matériel d'apprentissage généré le 2026-05-28 à partir de l'historique `git` réel de la branche `dev`.
> Objectif : comprendre **ce qui a été produit**, les **patterns**, les **libs** et leur **fonctionnement** — pas un audit, une transmission.

## La semaine en une phrase

**88 commits, mais 22 `refactor` pour seulement 7 `feat`** : ce fut une semaine de **durcissement et consolidation pré-launch** (V1 visée ~2026-06-07), pas d'extension de surface produit. On a solidifié le cœur (chat, auth, shared) et fermé la conformité, on n'a pas ajouté de bords.

## Les 4 cours

| # | Cours | Ce que tu y apprends | Commits clés |
|---|-------|----------------------|--------------|
| **A** | [DRY / refactor](./A-dry-refactor.md) | Extract-helper + sweep, codemods, machine à états circuit-breaker, Redis Lua atomique, anti-cache-stampede, compose-ref React 19 | PR-1→16 (`23 mai`) + web phases 1-4 |
| **B** | [RGPD / PII / consentement](./B-rgpd-pii-consent.md) | Consent gate fail-closed, audit hash-chain inviolable, outbox, effacement external-before-DB, pseudonymisation | #293/#294/#295/#302/#306 |
| **C** | [Pipeline chat](./C-chat-pipeline.md) | Architecture défense-en-profondeur, fuite GPS inversée, masquage PII Langfuse, invalidation de cache LLM, pièges de rendu RN | #305 + correctifs chat |
| **D+E** | [Coûts & multi-tenant](./D-E-costs-multitenant.md) | Circuit breaker *cost-aware*, intégrité d'un cost-cap, alertes Prometheus, défense BOLA, NPS en 1 requête SQL | #303/#304/#301 |

## Reprendre la formation & capturer les améliorations

- **[`RESUME-PROMPT.md`](./RESUME-PROMPT.md)** — prompt prêt à coller dans une **nouvelle session** pour reprendre la formation là où on s'est arrêté (méthode + état d'avancement inclus).
- **[`QUESTIONS-AND-IMPROVEMENTS.md`](./QUESTIONS-AND-IMPROVEMENTS.md)** — journal des interrogations **et** backlog des améliorations de code révélées par la discussion. Gouvernance : backlog → validation → `/team` (UFR-022) → roadmap/`TECH_DEBT.md`.

## Ordre de lecture conseillé

1. **A d'abord** — il pose le vocabulaire (helper, sweep, codemod, FSM, `ThreeStateCircuit`) réutilisé dans D+E.
2. **C ensuite** — le cœur produit, là où tu passes le plus de temps.
3. **B et D+E** — conformité et fiabilité, lisibles indépendamment.

## Fil rouge entre les cours (les ponts)

- **`ThreeStateCircuit`** (extrait en A, PR-13) est *appliqué* en D+E au confinement du coût STT/TTS. Lis A.PR-13 avant D+E.partie-1.
- **`stripFreeText` / masquage Langfuse** apparaît en C (observabilité) ET B (PII) — même hook, deux angles.
- **Le consent gate** (B) protège l'entrée du **pipeline chat** (C) : la couche RGPD est en amont des guardrails AI.
- **L'invalidation de cache LLM** (C, `cacheKey` dénormalisée) et **l'intégrité du cost-cap** (D+E) illustrent le même principe : une *source de vérité unique* pour une donnée dérivée.

## Note d'honnêteté (UFR-013) — fiabilité de ce matériel

- Tous les `path:line` cités ont été produits par lecture du code réel via `git show` + `Read`.
- **Corrigé** : la section `BaseModal` du cours A contenait initialement des extraits reconstruits (non lus depuis la source) ; ils ont été remplacés par le code réel de `museum-web/src/components/ui/BaseModal.tsx` (compose-ref + `resolvedLabelledBy`).
- **Vérifié par échantillon** : `isCoordinateString` (location.ts:19), `computeKey` (llm-cache.service.ts:47), `computeRowHash` (audit-chain), `voice-cost-pricing.ts`, `computeTenantScope` (tenant-scope.ts:28) — tous confirmés présents.
- **Limite connue** : les taux de réussite de tests cités (ex « 42/42 verts ») proviennent des **messages de commit**, pas d'une exécution de `pnpm test` dans cette session. À traiter comme « affirmé par l'auteur du commit », non « re-vérifié ».
- Le terme « two-phase erasure » (cours B) vient d'un message de commit ; le *pattern* existe bien dans `deleteAccount.useCase.ts` (external-before-DB) mais aucune fonction ne porte littéralement ce nom.
