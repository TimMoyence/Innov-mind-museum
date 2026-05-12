# 20 — Bloc 11 : Documentation & roadmaps réécrites

> **Pour qui ?** Toi, qui veux comprendre pourquoi on a supprimé 88 docs, ajouté 49 nouvelles, restructuré la roadmap en 3 fichiers, et où trouver chaque chose maintenant.
> **Durée de lecture :** ~10 minutes.

---

## Le contexte

Avant ce sprint, `docs/` contenait des dizaines de fichiers historiques : sprints terminés, plans abandonnés, audits one-shot, vieux ROADMAP_V2 / ROADMAP_ACTIVE / V2_PENDING qui se contredisaient. Quand un nouveau dev (humain ou agent) débarquait, il ne savait pas quel fichier était la **source de vérité**.

Le sprint a fait un **grand nettoyage** : 88 docs supprimées, 49 nouvelles, structure stable.

---

## Le problème en deux phrases

Trop de docs = **pas mieux que pas de docs**. Si tu as 5 fichiers qui parlent de la même chose, tu ne sais pas lequel est à jour. Si tu as un seul fichier propre, tu le lis et tu sais.

---

## Analogie : le rangement de placards

Tu déménages dans un nouvel appart. Si tu gardes 3 cartons "papiers-divers-2018-2019-2020" sans trier, tu ne retrouves jamais rien quand tu cherches une facture précise. Tri propre = un dossier par type, à jour.

Le sprint a fait ce tri pour `docs/`.

---

## Ce qui a été supprimé (commit `5d15a89e8`)

**56 docs obsolètes** d'un coup : "all shipped or killed". Liste catégorisée :

- **13 superpower plans** — plans Phase 0-8 superpowers, tous shipped.
- **20 superpower specs** — Phase 0-8.
- **4 NL_LINKEDIN_*** — drafts de posts marketing, plus pertinents.
- **NL_MASTER_PLAN** — vieux master plan superseded.
- **PROD_10_10_ROADMAP** — vieille roadmap superseded.
- **V12_W1/W5/W6/W7/W8** — specs de la V12 du framework /team, toutes shipped (intégrées dans les agents files + skill).
- **banking-grade-hardening-design** — la spec mère des 13 findings F1-F13. Devenue redondante après que chaque finding a son propre ADR.
- **Spec D recall** — spec produit "recommandations cross-museum", explicitly KILLED.
- **2 audits ponctuels** — résultats intégrés ailleurs.

### Earlier prune (commit `98019f3b3`)

32 docs déjà archivées supprimées : `ROADMAP_V2` 889 lignes, dossier `walk-spec/`, dossier `superpowers-2026-Q1Q2/`, `team-reports-2026-04-legacy/`. **L'archive a été inversée** par ta décision : "don't preserve, just delete".

---

## Ce qui a été ajouté ou restructuré

### La triple-roadmap

Avant : un seul `ROADMAP_ACTIVE.md` qui mélangeait produit, team orchestrator, mobile best-practices, etc.

Après : **3 roadmaps vivantes** :

| Roadmap | Scope | Lignes | Re-écrite |
|---------|-------|--------|-----------|
| [`ROADMAP_PRODUCT.md`](../ROADMAP_PRODUCT.md) | Features produit, OKR Q2-2026, NOW/NEXT/LATER, 4 KILLED | 148 | Chaque sprint |
| [`ROADMAP_TEAM.md`](../ROADMAP_TEAM.md) | Orchestrateur /team, OKR cost+quality, T1.x backlog, 3 KILLED | 169 | Chaque sprint |
| [`ROADMAP_FE_RN_BEST_PRACTICES.md`](../ROADMAP_FE_RN_BEST_PRACTICES.md) | F1..F12 mobile best-practices, F4 Hermes V1 demoted NOW→LATER | 120 | Chaque sprint |

**Pourquoi 3 fichiers** : chaque roadmap a son **OKR distinct** et sa **cadence**. Mélanger = confusion.

### Le sprint plan

`docs/SPRINT_2026-05-05_PLAN.md` (160L) — coordonne 3 worktrees parallèles (`cleanup/be`, `cleanup/fe`, `cleanup/web` + `main`) avec des **ADR territories non-overlapping** pour éviter les conflits merge.

C'est une innovation organisationnelle : au lieu d'avoir 4 devs (ou 4 agents) qui se marchent dessus sur les mêmes fichiers, chacun a un territoire.

### Les ADRs — 30 au HEAD

ADR = Architecture Decision Record. Un fichier markdown qui documente **une décision architecturale**, son contexte, ses options évaluées, le choix fait, les conséquences acceptées.

**23 nouveaux ADRs ce sprint** (ADR-011 → ADR-033). Avec **2 collisions ADR-031** (mobile-cert-pinning-kill-switch + zod-3-to-4-deferred) — sprint coordination overlap. Mineur.

Liste partielle :

| ADR | Sujet | Statut |
|-----|-------|--------|
| 011 | Rate-Limit fail-closed Redis | Accepted |
| 012 | Test pyramid taxonomy | Accepted |
| 013 | Admin facade kept | Accepted |
| 014 | MFA all roles | Accepted |
| 015 | LLM judge guardrail v2 | Accepted (behind flag) |
| 016 | Mobile cert pinning Phase 2 scaffold | Accepted (V1 ship-disabled) |
| 017 | MFA RN wire deferred | Re-confirmed |
| 018 | support_tickets retention | Accepted |
| 019 | reviews retention | Accepted |
| 020 | art_keywords retention | Accepted |
| 021 | PgBouncer transaction mode | Accepted (design only) |
| 022 | PG read replica strategy | Accepted (design only) |
| 023 | Redis cluster vs Sentinel | Accepted (design only) |
| 024 | Cloudflare CDN strategy | Accepted (design only) |
| 025 | State management governance mobile | Accepted |
| 026 | SLO + observability strategy | Accepted |
| 027 | Sentry RN 8.9.1 shipped | Accepted |
| 028 | Module composition singletons deferred | Re-confirmed |
| 029 | Documenter agent swap to Sonnet | Accepted |
| 030 | LLM-judge daily budget Redis | Accepted (fail-CLOSED) |
| 031-mobile | Mobile cert pinning kill-switch architecture | Accepted (scaffold) |
| 031-zod | Defer zod 3→4 migration post-launch | Accepted |
| 032 | TypeScript monorepo alignment 5.9.3 | Accepted |
| 033 | zod 3 (BE) / 4 (FE) status-quo | Accepted |

**Convergence post-sprint** :

| Tool | BE | FE | Web | Status |
|------|----|----|-----|--------|
| TypeScript | `^5.9.3` | `~5.9.2` | `~5.9.3` | **Aligné 5.9.x** |
| ESLint | `^10.2.0` | `^9.39.4` | `^9.39.4` | Deferred ADR-010 |
| zod | `^3.25.76` | `^4.4.1` | (none) | Status-quo ADR-033 |

---

## Les runbooks ajoutés

Runbook = procédure opérationnelle pour un cas spécifique. À lire **avant** ou **pendant** un incident.

| Fichier | But |
|---------|-----|
| `RUNBOOKS/secrets-rotation.md` | Cadence + protocole dual-key 72h soak pour chaque secret signing |
| `RUNBOOKS/audit-chain-forensics.md` | Que faire si la chaîne d'audit casse (cf. doc 03) |
| `RUNBOOKS/CERT_ROTATION.md` | Capture SPKI hash + rotation 3-pin + mass-mispin recovery (cf. doc 05) |
| `MIGRATION_GOVERNANCE.md` | 8 règles pour les migrations TypeORM (cf. doc 10 / 15) |
| `CHAOS_RUNBOOKS.md` | 3 chaos experiments staging-only + cadence quarterly |
| `SLO.md` | API 99.9%, /chat/messages p99 <5s, error budget (cf. doc 14) |
| `CAPACITY_PLAN.md` | 3 tiers de capacité avec sizing (cf. doc 12) |
| `observability/musaium-backend-dashboard.json` | Grafana dashboard JSON 5 panels (cf. doc 14) |

### Pourquoi des runbooks séparés des ADRs

ADR = **décision** (pourquoi on a choisi ça).
Runbook = **procédure** (quoi faire dans tel cas).

Tu lis l'ADR pour comprendre, le runbook pour exécuter. Distinction utile.

---

## Doc → code drift signalé

Le sprint a aussi détecté quelques inconsistances qui restent :

- **`AI_VOICE.md`** référence `ADR-001-sse-streaming-deprecated.md` qui a été supprimé → lien cassé.
- **`MIGRATION_GOVERNANCE.md` §5** lien cassé vers la spec FK indexes (supprimée).
- **`ADR-007`** statut "Proposed" alors que CLAUDE.md dit que coverage gate est enforced → header obsolète.
- **`DOCS_INDEX.md`** dit "ADRs (002-028)" → obsolète, on est à 002-033.
- **`RUNBOOKS/README.md`** ne liste pas les 3 nouveaux runbooks.
- **`HORIZONTAL_SCALING.md` + `CDN_CLOUDFLARE_SETUP.md`** (Mars 2026, pre-window) pas refresh malgré ADR-011 + ADR-024 qui obsolètent des parties.

**Ces drifts sont mineurs** mais à clean post-launch pour ne pas désorienter les futurs lecteurs.

---

## L'index `DOCS_INDEX.md`

Si tu cherches un doc et tu ne sais pas où, **commence par `docs/DOCS_INDEX.md`**. C'est l'index thématique mis à jour au sprint.

---

## Pourquoi c'est pertinent pour Musaium

### Onboarding

Un nouveau dev (humain ou agent) qui rejoint Musaium aujourd'hui ouvre `CLAUDE.md` → suit les liens vers `ROADMAP_PRODUCT.md` + `ROADMAP_TEAM.md` + `DOCS_INDEX.md` → en 30 minutes a la map mentale complète. Avant le sprint = 1-2 jours.

### Décisions traçables

Quand dans 6 mois quelqu'un dira "pourquoi on n'a pas activé la cert-pinning en V1 ?", tu pointes ADR-016. Pas de débat, c'est documenté.

### Pas de double source de vérité

Avant : ROADMAP_ACTIVE + V2_PENDING + Spec X + Plan Y… 4 endroits qui parlaient du même feature, tous obsolètes différemment. Après : 1 endroit (`ROADMAP_PRODUCT.md` ou `ROADMAP_TEAM.md`), réécrit chaque sprint.

### Le coût "spring cleaning"

49 docs ajoutées + 88 supprimées = **net -39 fichiers**. La size du repo `docs/` a diminué. C'est sain.

---

## Est-ce overkill ?

**Non.** Le tri était nécessaire. Sans, le `docs/` deviendrait un dépotoire en 6 mois supplémentaires.

Le seul "overkill" potentiel = avoir fait **23 ADRs en un sprint** plutôt que 5 plus essentiels. Argument contre : chaque ADR documente une vraie décision prise pendant le sprint, et ne pas la documenter = la perdre.

---

## Les sprints précédents archivés

Important : la **history complète** n'est pas perdue. Les sprints d'avril et avant sont archivés sous `docs/archive/v1-sprint-2026-04/` :
- `PROGRESS_TRACKER.md` (57 KB) — checkbox tracker.
- `SPRINT_LOG.md` (169 KB) — journal technique détaillé.
- `*_AUDIT_2026-04-0*.md` — audits ponctuels.

Aussi :
- `docs/archive/roadmaps/V3_REVIEW_AND_PLAN.md` — revue stratégique V3.

C'est de la **documentation institutionnelle** : tu n'y vas jamais en daily, mais c'est utile pour comprendre des décisions très anciennes ou pour onboarder un dev qui veut l'historique.

---

## Récap : ce que tu dois faire

| Action | Statut |
|--------|--------|
| Lire `docs/DOCS_INDEX.md` une fois | Pour avoir la map des docs |
| Vérifier que `ROADMAP_PRODUCT.md` reflète bien le sprint courant | Sera réécrit en fin de sprint via `/team roadmap:rotate` |
| Fix les 6 doc→code drifts listés | Tâche post-launch (1h max) |
| Si tu écris une nouvelle décision architecturale | Créer un nouvel ADR dans `docs/adr/`, format markdown standard |
| Si tu veux supprimer un doc historique | Toujours préférer `git mv` vers `docs/archive/` plutôt que `git rm` |

---

## Format ADR standard chez Musaium

Pour référence si tu écris un nouvel ADR :

```markdown
# ADR-XXX: <Titre court>

**Status:** Accepted | Proposed | Deferred | Superseded
**Date:** 2026-MM-DD

## Context

<Quel problème on résout. Pourquoi maintenant.>

## Decision

<Ce qu'on a choisi.>

## Consequences

### Positive
- <Ce que ça nous apporte.>

### Negative
- <Ce qu'on accepte de perdre.>

### Mitigations
- <Comment on couvre les négatives.>

## Alternatives considered

- <Option A> — pourquoi rejetée.
- <Option B> — pourquoi rejetée.

## References

- <Liens externes éventuels.>
```

Ouvre n'importe quel ADR récent (ex `ADR-014-mfa-all-roles-enforcement.md`) pour voir un exemple complet.
