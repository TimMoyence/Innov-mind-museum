# Explications pédagogiques — Sprint 2026-04-30 → 2026-05-05

> **Pour qui ?** Toi (Tim), en mode "j'ouvre le capot et j'explique chaque pièce comme à un élève".
> **Pourquoi ?** Le récap technique (`docs/SPRINT_RECAP_2026-04-30_TO_2026-05-05.md`) est dense (1403 lignes). Cette série déballe **chaque bloc** en français, avec contexte, extraits du code de l'app, et arbitrage "est-ce overkill ou non".
> **Source matière :** rapports d'audit `01-code-review.md`, `02-security-review.md`, `03-doc-review.md`, `04-package-review.md` dans `.claude/skills/team/team-reports/working/2026-05-05-recap-investigation/` + le récap consolidé.

## Comment lire cette série

Chaque document suit le même squelette :

1. **Le problème en une phrase** — ce qu'on essayait de résoudre.
2. **Analogie quotidienne** — un parallèle non-technique pour ancrer l'idée.
3. **Vocabulaire** — termes techniques avec définition courte, à connaître pour la suite.
4. **Comment ça marche dans Musaium** — extraits de code réels, fichier + ligne.
5. **Pourquoi c'est pertinent pour Musaium** — pas un caprice abstrait, mais ce que ça nous coûte si on l'enlève.
6. **Est-ce overkill ?** — réponse honnête, contexte du lancement V1, alternatives plus légères si elles existent.
7. **Ce que tu dois faire** — étapes opérationnelles claires.

---

## Partie 1 — Tes 5 questions initiales (sprint review pédagogique)

| # | Document | Sujet | Action de Tim ? |
|---|----------|-------|-----------------|
| 01 | [`01-bloc-1-banking-grade-hardening.md`](./01-bloc-1-banking-grade-hardening.md) | Les 13 findings F1 → F13 + Defense-in-Depth (rate-limit, CSRF, MFA, HIBP, etc.) | Lire, comprendre, valider |
| 02 | [`02-cosign-slsa-compose-vps.md`](./02-cosign-slsa-compose-vps.md) | Cosign + SLSA L3 : ce qui se passe en CI, ce que tu dois (ou pas) faire sur ton compose VPS | **Oui** — vérifier scope `read:packages` |
| 03 | [`03-audit-chain-slack.md`](./03-audit-chain-slack.md) | Le cron quotidien d'audit-chain pingue Slack mais Slack n'a jamais été branché. Trois options pour réparer. | **Oui** — choisir une option (B recommandée) |
| 04 | [`04-guardrails-juges-promptfoo-latence.md`](./04-guardrails-juges-promptfoo-latence.md) | Toutes les couches de filtrage chat (mots-clés, juge LLM, llm-guard, classifier, Promptfoo) : carte, latences, cas "cathédrale bloquée" | Décider du calibrage V1 |
| 05 | [`05-cert-pinning-kill-switch.md`](./05-cert-pinning-kill-switch.md) | Cert pinning Phase 2 + kill-switch : pourquoi désactivé V1, comment activer post-launch | Aucune action V1 — info |

---

## Partie 2 — Le sprint complet, bloc par bloc

| # | Document | Bloc SPRINT_RECAP | Sujet |
|---|----------|-------------------|-------|
| 06 | [`06-bloc-2-v12-orchestrator-supply-chain.md`](./06-bloc-2-v12-orchestrator-supply-chain.md) | Bloc 2 (sans Cosign/audit-chain déjà couverts) | Langfuse, Renovate, indirect-injection wrapper, Promptfoo, fast-check, ping-gate fix |
| 07 | [`07-bloc-3-architecture-hexagonale.md`](./07-bloc-3-architecture-hexagonale.md) | Bloc 3 | Hexagonal layout canonique, import discipline 154 fichiers, barrel-file policy, 11 god-files split |
| 08 | [`08-bloc-4-walk-mode.md`](./08-bloc-4-walk-mode.md) | Bloc 4 | Walk mode (intent=walk) end-to-end : DB, prompt, structured output Zod, chips UI |
| 09 | [`09-bloc-5-personalization.md`](./09-bloc-5-personalization.md) | Bloc 5 | Personalization Spec C — UserMemory (langue, P90 durée) + voice TTS catalog + replay-snapshot invariant |
| 10 | [`10-bloc-6-data-hardening.md`](./10-bloc-6-data-hardening.md) | Bloc 6 partie 1 | Data hardening — VersionColumn + optimistic lock, art_keywords race fix, Check1776, JSONB Zod transformer 12 colonnes |
| 11 | [`11-bloc-6-retention.md`](./11-bloc-6-retention.md) | Bloc 6 partie 2 | Retention policies (Spec E) — support_tickets 365j, reviews 30/60j, art_keywords 90j |
| 12 | [`12-bloc-6-scale-infra.md`](./12-bloc-6-scale-infra.md) | Bloc 6 partie 3 | Scale infra design (Spec F) — PgBouncer, PG replica, Redis Cluster, CDN. Code prêt, provisioning deferred |
| 13 | [`13-bloc-6-llm-cache.md`](./13-bloc-6-llm-cache.md) | Bloc 6 partie 4 | LLM response cache (Spec G) — 3 ContextClass avec TTL adaptatif, key shape museum-AVANT-user |
| 14 | [`14-bloc-6-observability-slo.md`](./14-bloc-6-observability-slo.md) | Bloc 6 partie 5 | Observability + SLO + chaos (Spec H) — Prometheus, Grafana 5 panels, k6 100K rps runbook |
| 15 | [`15-bloc-6-db-indexes-a1-a2.md`](./15-bloc-6-db-indexes-a1-a2.md) | Bloc 6 partie 6 | DB indexes A1+A2 zero-downtime — speedups 368× à 1075× sur les hot queries |
| 16 | [`16-bloc-7-tests-phases-0-11.md`](./16-bloc-7-tests-phases-0-11.md) | Bloc 7 (le plus dense) | 11 phases de tests : taxonomy, Stryker mutation, e2e auth, chaos, factory enforcement, coverage gate, SWC speedup |
| 17 | [`17-bloc-8-production-bugs.md`](./17-bloc-8-production-bugs.md) | Bloc 8 | 4 vrais bugs prod détectés + audit pre-roadmap 6 bugs (le 🚨 verifyEmail token replay) |
| 18 | [`18-bloc-9-ios26-crash-instrumentation.md`](./18-bloc-9-ios26-crash-instrumentation.md) | Bloc 9 | iOS 26 / A18 Pro React-bridge crash — instrumentation Swift + JS + RN bump |
| 19 | [`19-bloc-10-typescript-strictness.md`](./19-bloc-10-typescript-strictness.md) | Bloc 10 | TypeScript strictness — `noUncheckedIndexedAccess` 176 sites FE + `as unknown` casts narrowés |
| 20 | [`20-bloc-11-documentation-roadmaps.md`](./20-bloc-11-documentation-roadmaps.md) | Bloc 11 | Documentation & roadmaps — 88 docs supprimées, triple-roadmap, 30 ADRs au HEAD, 8 runbooks |
| 21 | [`21-bloc-12-packages.md`](./21-bloc-12-packages.md) | Bloc 12 | Packages — `langfuse`, `prom-client`, SWC, fast-check, RHF + Zod 4 FE, Playwright + axe Web, uuid override drama |

---

## Conventions dans les extraits de code

- Chaque extrait porte le `chemin/du/fichier.ts:ligne` dans son titre.
- Les commentaires `//` ou `/* */` dans les extraits sont **ceux du code source réel**, pas mes annotations.
- Mes propres commentaires explicatifs sont dans le texte qui entoure l'extrait, jamais dans l'extrait lui-même.

---

## Ordre de lecture suggéré

### Si tu as 1 heure ce soir

Lis les **5 docs de la Partie 1** (01 → 05), dans cet ordre :
- **01** d'abord parce que c'est le gros morceau et qu'il pose le vocabulaire sécurité.
- **04** ensuite parce que c'est la question produit la plus chaude (latence + faux positifs).
- **03** parce que c'est une vraie action ops à régler.
- **02** parce qu'il faut décider si tu touches au compose VPS ou pas.
- **05** en dernier, c'est le moins urgent (V1 ship-disabled).

### Si tu veux comprendre tout le sprint sur un weekend

Lis dans cet ordre logique (~5h total) :

1. **Sécurité d'abord** : 01 (banking-grade) + 02 (cosign) + 03 (audit-chain) + 04 (guardrails) + 05 (cert pinning).
2. **Architecture** : 07 (hexagonal) + 20 (documentation/roadmaps).
3. **Features produit** : 08 (walk) + 09 (personalization).
4. **Data** : 10 (hardening) + 11 (retention) + 15 (indexes).
5. **Infra & ops** : 12 (scale) + 13 (LLM cache) + 14 (observability).
6. **Qualité** : 16 (tests) + 17 (bugs prod) + 19 (TS strictness).
7. **Mobile** : 18 (iOS 26 crash).
8. **Stack** : 06 (V12 orchestrator) + 21 (packages).

### Si tu veux juste savoir quelles actions concrètes tu dois faire

Saute à la section "**Récap : ce que tu dois faire**" en bas de chaque document. C'est toujours le dernier paragraphe.

Et regarde [`docs/ROADMAP_TEAM.md`](../ROADMAP_TEAM.md) § **T1.7 Deploy ops follow-ups** qui consolide les actions deploy.

---

## Comment cette série a été produite

Multi-agent, 1 agent par document, en mode "professeur explicatif français". Source matière :
- `docs/SPRINT_RECAP_2026-04-30_TO_2026-05-05.md` (récap consolidé du sprint).
- 4 rapports bruts d'audit dans `.claude/skills/team/team-reports/working/2026-05-05-recap-investigation/`.
- Lecture en direct du code source pour chaque extrait cité.
- Cross-référencement avec les ADRs et runbooks existants.

Si tu trouves une erreur factuelle, signale-la et je la corrige.

---

## Quick-search par mot-clé

| Tu cherches... | Va voir... |
|----------------|-----------|
| "comment marche le rate-limit" | doc 01 § F1 |
| "pourquoi les cookies sont httpOnly" | doc 01 § F7 |
| "où sont les indexes Postgres ajoutés" | doc 15 |
| "comment je désactive les guardrails complexes" | doc 04 § Récap |
| "pourquoi 5817 tests" | doc 16 |
| "qu'est-ce qu'un SLO" | doc 14 |
| "comment marche le cache LLM" | doc 13 |
| "pourquoi mon `arr[i]` est typé `T \| undefined`" | doc 19 |
| "comment ajouter un nouvel ADR" | doc 20 § fin |
| "pourquoi on a Renovate au lieu de Dependabot" | doc 06 |
| "comment activer la cert pinning post-launch" | doc 05 § Étape 1-7 |
| "le `verifyEmail` était un vrai bug ?" | doc 17 § Bug 4 |
| "pourquoi 246 fichiers ont été déplacés" | doc 07 |
