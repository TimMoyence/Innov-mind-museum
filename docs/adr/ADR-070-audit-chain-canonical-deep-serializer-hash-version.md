# ADR-070 — Audit hash chain: canonical deep-recursive serializer + out-of-payload `hash_version`

**Status:** Accepted — implemented (working tree, not yet committed at ADR authoring time)
**Date:** 2026-06-04
**Deciders:** /team run `2026-06-04-audit-chain-nested-hash` (architect + editor + reviewer fresh-context UFR-022). Reviewer APPROVED, weightedMean **92.3**.
**Implemented in:** working tree — `museum-backend/src/shared/audit/audit-chain.ts`, `museum-backend/src/shared/audit/auditLog.entity.ts`, `museum-backend/src/shared/audit/audit.repository.pg.ts`, `museum-backend/scripts/audit-chain-verify.ts`, `museum-backend/src/data/db/migrations/1780564269011-AddAuditLogHashVersion.ts` (new), `museum-backend/src/data/db/migrations/1777100000000-AddAuditLogHashChain.ts` (import-shared)
**Related spec/design:** [`spec.md`](../../.claude/skills/team/team-state/2026-06-04-audit-chain-nested-hash/spec.md) · [`design.md`](../../.claude/skills/team/team-state/2026-06-04-audit-chain-nested-hash/design.md)
**Reviewer JSON (APPROVED 92.3):** [`code-review.json`](../../.claude/skills/team/team-reports/2026-06-04-audit-chain-nested-hash/code-review.json)
**Closes:** TD-61 (audit 360 AUDIT-01 + AUDIT-02)

---

## Context

La chaîne d'audit tamper-evident (`audit_logs`, `row_hash` = SHA-256(payload + `prev_hash`)) est l'artefact d'intégrité censé prouver qu'aucune ligne n'a été altérée. Une de ces lignes — la notification de violation CNIL (GDPR Art. 33-34, écrite par `auditCriticalSecurityEvent`, `audit.service.ts:207-219`) — est **légalement opposable au régulateur**.

Le calcul du hash sérialisait `metadata` ainsi (`audit-chain.ts`, avant correctif) :

```ts
JSON.stringify(input.metadata, Object.keys(input.metadata).sort((a, b) => a.localeCompare(b)))
```

Le 2ᵉ argument array de `JSON.stringify` est un **replacer-allowlist appliqué RÉCURSIVEMENT à tous les niveaux**, mais alimenté uniquement des clés **top-level**. Tout objet imbriqué (`metadata.breach.{…}`, `metadata.provider.{…}`) était donc sérialisé `{}` vide. Conséquences vérifiées (reproduites `node -e` en spec, re-vérifiées par le reviewer) :

1. **Collision sur le contenu forensique.** Deux breaches de gravité / description / deadline CNIL différentes mais de mêmes clés top-level (`{ breach }`) produisaient **le même `row_hash`** : `{breach:{count:1200}}` et `{breach:{count:9999}}` → hash identique. L'invariant tamper-evidence (« toute mutation casse la chaîne ») était violé pour tout champ imbriqué — précisément là où vit le payload de breach opposable.
2. **Divergence runtime ↔ migration.** La migration de backfill `AddAuditLogHashChain1777100000000` utilisait, elle, un `stableStringify` **correct** (deep, clés triées partout). Runtime et backfill calculaient donc des hashes incompatibles dès qu'un metadata imbriqué était présent.
3. **Oracles de test buggés (AUDIT-02).** Les tests ré-implémentaient ou réutilisaient le sérialiseur buggé comme « valeur attendue » (`audit-chain.test.ts:145-159`, `audit-breach.test.ts` produisant ET vérifiant via `computeRowHash`), rendant le défaut structurellement invisible : les suites verdissaient sur du metadata imbriqué.

Forces en présence : (i) restaurer l'injectivité du hash vis-à-vis du contenu sémantique des metadata ; (ii) ne PAS générer de faux `BREAK` nightly sur les lignes **déjà persistées** sous l'ancien sérialiseur (`audit-chain-cli-core.ts`, alerte Slack) ; (iii) préserver la **valeur forensique** des lignes historiques (ne pas effacer une altération antérieure) ; (iv) respecter `MIGRATION_GOVERNANCE` + le trigger append-only `prevent_audit_log_mutation` (UPDATE-only) ; (v) pré-launch, prod = stage, faible volume de lignes (`project_no_staging_v1`).

---

## Decision

### 1. Sérialiseur canonique deep-recursif, source unique partagée

Une fonction pure `canonicalStringify(value)` (`audit-chain.ts`) sérialise JSON de façon déterministe avec **clés triées à TOUS les niveaux d'imbrication** : `null`/scalaires via `JSON.stringify`, tableaux ordre-préservé récursif, objets `{JSON.stringify(k):rec(v)}` clés triées. C'est l'**unique** définition, importée par le runtime (`computeRowHash`) **et** par la migration de backfill `AddAuditLogHashChain` (qui abandonne son `stableStringify` inline). `audit-chain.ts` reste un module `@shared` pur (`node:crypto` only, aucun side-effect d'import) → importable par le runner migration TypeORM. La parité est verrouillée par un **snapshot de sortie sérialisée** dans le test de parité (modifier la def fait échouer la parité).

#### INVARIANT CRITIQUE — comparateur de clés = code unit, clés lowercase-first obligatoires

Le comparateur de tri est **épinglé sur l'ordre code unit UTF-16** (`byCodeUnit`: `a < b ? -1 : a > b ? 1 : 0`), **pas** `localeCompare`, **pas** `.sort()` implicite. `localeCompare` dépend de la locale ICU (`process.env.LANG`, version Node/ICU) → non-déterministe cross-plateforme. `byCodeUnit` est le SEUL comparateur, donc runtime ≡ migration ≡ oracle de test par construction.

> **Note de gouvernance migration (IMPORTANT) :** la migration **déjà-jouée** `AddAuditLogHashChain` a vu son sérialiseur de backfill basculer de `localeCompare` → code-unit (en adoptant `canonicalStringify` partagé). Les deux ordres **divergent** sur des clés sœurs de casse mixte (ex. `{Z, a}` : `localeCompare` met `a` avant `Z` ; code-unit met `Z` avant `a` — vérifié `node -e`). **Impact sur les données actuelles = ZÉRO** : toutes les clés de metadata d'audit réelles sont camelCase / lowercase-first (`breach.{auditId,severity,detectedAt,…}`, `provider.{name,version}`) → les deux ordres sont **identiques** (vérifié), et prod **ne ré-exécute pas** une migration appliquée → aucun `row_hash` live ne change. **MAIS** le schéma Zod `AuditMetadataSchema` DOIT continuer d'imposer des clés **lowercase-first** : un futur mainteneur ajoutant une clé d'audit à majuscule initiale ferait diverger l'ordre v2 sur une DB fraîchement backfillée. Le chemin de vérification legacy (v1, `legacyMetadataJson`) conserve `localeCompare` à l'identique → les lignes historiques se vérifient de façon cohérente quoi qu'il arrive.

### 2. Dispatch versionné par colonne `hash_version` hors-payload (Q1 — option A)

`computeRowHash(input, prevHash, hashVersion = CURRENT_HASH_VERSION)` dispatche le sérialiseur de `metadata` :

- **v1 (legacy, FIGÉ)** = `legacyMetadataJson` — reproduction **byte-for-byte** de l'ancien runtime buggé (`Object.keys(meta).sort(localeCompare)`, top-level only). Conservé tel quel pour que les `row_hash` historiques recalculent à l'identique.
- **v2 (`CURRENT_HASH_VERSION = 2`)** = `canonicalStringify` (deep). Toute nouvelle écriture est v2.

Le discriminateur est une **colonne dédiée `hash_version SMALLINT NOT NULL DEFAULT 1`** (nouvelle migration `AddAuditLogHashVersion1780564269011`), portée **HORS du payload du hash** (comme `ip`/`request_id`). `verifyAuditChain` recompute chaque ligne sous `row.hashVersion ?? CURRENT_HASH_VERSION` : les lignes legacy (estampillées `1` par le `DEFAULT`) sont vérifiées sous v1 figé → **zéro faux BREAK** ; les nouvelles sous v2. Le payload pipe-order, le séparateur `|`, la convention `null → ''`, l'exclusion `ip`/`requestId`/`actorType`, le genesis 64 zéros et le digest hex SHA-256 sont **inchangés** (R8).

### 3. Oracles de test indépendants (AUDIT-02)

Les tests audit n'utilisent plus le sérialiseur buggé ni `computeRowHash` comme oracle de leur propre exactitude. Un `oracleCanonical` / `oracleRowDigest` écrit à la main (impl naïve distincte, byte-comparée à la sortie prod par le test de parité) sert de référence, sur au moins un cas de metadata **imbriqué** + tableau d'objets (Q4) + chaîne mixte v1/v2 (AC7) + mutation imbriquée qui casse la chaîne (AC6).

---

## Consequences

### Positifs
- **Tamper-evidence restauré sur le contenu forensique.** La ligne de breach CNIL est désormais couverte par sa propre signature : muter `breach.severity` `P0`→`P2` ou `breach.description` casse `verifyAuditChain` au bon index (AC6). `canonicalStringify` est injectif vis-à-vis du contenu sémantique des metadata réels (collision fermée, vérifiée).
- **Parité runtime ≡ migration** prouvée sur de l'imbriqué, garantie structurellement par une **source unique** (snapshot-pinned, divergence impossible).
- **Zéro faux BREAK** sur les lignes historiques + **valeur forensique préservée** : aucune réécriture de `row_hash` (pas de recompute), aucun sign-off DPO requis.
- Oracles de test sains → les mutants Stryker du sérialiseur deep (que l'oracle buggé laissait survivre) sont désormais tués.

### Négatifs / coûts
- **Une colonne de schéma** (`hash_version`) + un param optionnel sur `computeRowHash`. Coût marginal.
- **Downgrade de code à éviter une fois des lignes v2 écrites.** Le dispatch est porté par la **colonne** (donnée, pas code). Un rollback strict vers un binaire pré-correctif (qui *ignore* la colonne et recompute tout en v1) ferait diverger les lignes v2 → faux BREAK nightly. Mitigation : tant que la colonne survit, une version future qui lit `hash_version` reste correcte ; pré-launch (faible volume) le risque réel est minime.
  - **Downgrade NON-exploitable comme vecteur d'altération** : `hash_version` est hors-payload, mais une mutation de la colonne (ou de toute colonne) sur une ligne existante est bloquée **en amont** par le trigger append-only `prevent_audit_log_mutation` (BEFORE UPDATE) ; et même en supposant le trigger contourné, une ligne « rétrogradée » recompute vers un hash divergent → `BREAK` détecté. Pas de chemin silencieux v2→v1.

### Neutres / non affectés
- **OpenAPI : aucun impact.** `audit_logs` n'est exposé par aucune route publique (la lecture DSAR `listForActor` mappe vers un DTO excluant `prevHash`/`rowHash` et n'expose pas `hashVersion`).
- **Latence inchangée** — sérialiseur deep sur des objets ≤ quelques Ko, < 1 ms, négligeable devant `pg_advisory_xact_lock` (5–100 ms/INSERT). Lock chain non touché (C7).
- **CLI `audit-chain-cli-core.ts` inchangé** (signature `verifyAuditChain(rows)` préservée, la version est portée par chaque ligne) → payloads `INTACT`/`BREAK` + alerte Slack intacts (R10).
- **Trigger append-only / `MIGRATION_GOVERNANCE`** : `ADD COLUMN` ne fait pas d'`UPDATE` sur `row_hash` → pas de DROP/re-ADD du trigger, pas de SAVEPOINT, pas de backfill loop.
- **RGPD** : `ip`/`requestId`/`actorType` restent hors hash ; `hash_version` est une donnée technique non-personnelle. L'anonymiseur IP 13 mois ne casse pas la chaîne.

---

## Alternatives considered

| Option (stratégie historique Q1) | Verdict |
|---|---|
| **(A) Versionnement de schéma, colonne `hash_version` hors-payload** | **Retenue.** Préserve la valeur forensique (aucun recompute), zéro faux BREAK, une seule marche de chaîne (dispatch per-row), `ADD COLUMN` ne déclenche pas le trigger UPDATE-only. |
| Sous-option A — préfixe dans le payload | Rejetée — changerait le `row_hash` de toutes les lignes (y compris legacy au recompute) → invaliderait la chaîne historique. |
| Sous-option A — clé `__hashVersion` réservée dans `metadata` | Rejetée — `metadata` EST dans le hash → idem invalidation + pollue le jsonb validé par `AuditMetadataSchema`. |
| **(B) Migration de recompute** (re-walker + réécrire `row_hash`/`prev_hash`) | Rejetée — **efface la valeur forensique** : recomputer un hash rend la chaîne intègre par construction, masquant toute altération antérieure à la migration ; exige un avis/sign-off conformité-DPO ; DROP/re-ADD du trigger append-only. |
| **(C) Re-stamp genesis / segmentation de chaîne** (chaîne v2 neuve, v1 archivée) | Rejetée — impose une double-chaîne + double vérification dans le CLI → complexité opérationnelle supérieure pour le même bénéfice que A. |
| Comparateur `localeCompare` | Rejetée — dépend de la locale ICU → non-déterministe cross-plateforme (cf. INVARIANT §1). |
| Duplication du sérialiseur (runtime + migration séparés) | Rejetée par défaut au profit de l'import partagé ; fallback documenté = duplication **byte-identique** (même comparateur code-unit) verrouillée par un snapshot de parité, si le runner migration ne résolvait pas l'import `@shared/*` (vérifié résolvable : `ts-node -r tsconfig-paths/register`). |
| Feature flag de bascule v1/v2 | Rejetée — pré-launch, pas de flag runtime (UFR-015). Le sérialiseur v2 est inconditionnel pour les nouvelles écritures. |

---

## Verification

- **Gates** : verify PASS-AUDIT-SCOPE (lint + tsc + 35/35 tests audit scoped verts au HEAD, ré-exécutés par le reviewer) ; les 15 reds full-suite sont 100 % environnementaux (Redis NOAUTH + pgvector/SigLIP), aucun ne référence le changement (verify-triage). Security PASS (SHA-256 inchangé, sérialiseur injectif sur l'ambiguïté de séparateur `{"a":"b:c"} != {"a:b":"c"}` vérifié, aucune interpolation SQL, PII hors hash). Review **APPROVED 92.3** (correctness 93 / security 92 / maintainability 94 / testCoverage 92 / docQuality 88).
- **Frozen-test** PASS — manifest sha256 byte-identique au HEAD, `modifiedDuringGreen: []`.
- **Spec ↔ impl** : R1/AC1 … R10/AC7 = 10/10 PASS (matrice de traçabilité dans `code-review.json`), vérifiés indépendamment `node -e` (AC4 snapshot == sortie réelle ; v1 byte-identique à l'ancien runtime ; v2 ferme la collision, v1 collisionne encore fidèlement).

### Backlog (LOW, security — non bloquant)
- `canonicalStringify` émet le token littéral `undefined` pour une **valeur d'objet imbriquée** `undefined` (JSON invalide mais déterministe). **Non atteignable aujourd'hui** : breach + guardrail construisent leur metadata via `?? null` et `AuditMetadataSchema` (Zod) interdit les valeurs `undefined` dans `metadata` → cela n'atteint jamais le hash. Durcissement futur : soit garder la garde `?? null` au site d'émission comme invariant documenté, soit normaliser `undefined → null` dans `canonicalStringify`. Tracé en TODO ; deterministe + injectif pour les besoins de hachage en l'état.

---

## References

- Spec — [`spec.md`](../../.claude/skills/team/team-state/2026-06-04-audit-chain-nested-hash/spec.md) §1–§9 (R1–R10, AC1–AC8, Q1–Q4)
- Design — [`design.md`](../../.claude/skills/team/team-state/2026-06-04-audit-chain-nested-hash/design.md) D1–D6
- Reviewer JSON (APPROVED 92.3) — [`code-review.json`](../../.claude/skills/team/team-reports/2026-06-04-audit-chain-nested-hash/code-review.json)
- STORY — [`STORY.md`](../../.claude/skills/team/team-state/2026-06-04-audit-chain-nested-hash/STORY.md)
- Tech debt — [TD-61](../TECH_DEBT.md) (audit 360 AUDIT-01 + AUDIT-02)
- Related — [ADR-054](ADR-054-audit-chain-merkle-batch-redesign.md) (refonte Merkle batch 100k MAU, post-launch, **non touchée** par ce run), [ADR-060](ADR-060-gdpr-erasure-dsar-compliance-chain.md) (GDPR erasure/DSAR), [ADR-069](ADR-069-museum-search-id-osm-generic-conversation.md) (ADR précédent). CLAUDE.md § Audit chain `pg_advisory_xact_lock` + § Migration Governance.
