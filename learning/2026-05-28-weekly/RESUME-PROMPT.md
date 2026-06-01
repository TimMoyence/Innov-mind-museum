# Prompt de reprise — formation « semaine du 21-28 mai 2026 »

> Colle le bloc ci-dessous dans une **nouvelle session** Claude Code (à la racine du repo) pour
> reprendre la formation là où on s'est arrêté, sans dépendre de la mémoire de la session précédente.

---

```
Reprenons une session de FORMATION sur le code produit cette semaine (2026-05-21 → 2026-05-28).
Objectif : tu m'enseignes ce qui a été produit (code, patterns, libs, fonctionnement), un item à
la fois, et on AMÉLIORE le code au fil de la discussion. « C'est en discutant du code qu'on l'améliore. »

AVANT TOUTE RÉPONSE, lis ces fichiers (ce sont le curriculum et l'état d'avancement) :
1. learning/2026-05-28-weekly/README.md          ← carte des 4 cours + ponts entre eux
2. learning/2026-05-28-weekly/A-dry-refactor.md  ← cours A (DRY/refactor)
3. learning/2026-05-28-weekly/C-chat-pipeline.md ← cours C (pipeline chat)
4. learning/2026-05-28-weekly/B-rgpd-pii-consent.md
5. learning/2026-05-28-weekly/D-E-costs-multitenant.md
6. learning/2026-05-28-weekly/QUESTIONS-AND-IMPROVEMENTS.md ← mes questions + le backlog d'améliorations

OÙ ON EN EST (mets à jour la section « Avancement » de ce fichier RESUME-PROMPT.md au fil de l'eau) :
- Thème A, fondations couvertes : A.0 (pourquoi refactorer avant un launch), A.1 (technique
  « extract helper + sweep » + codemod), A.2 (le sentinel décortiqué sur le cas réel
  route-discipline-requireUser-codemod.test.ts).
- Questions closes : Q1 (sanity <= 7 / frozen-test) et Q2 (sentinel par liste figée) — cf. fichier 6.
- Amélioration ouverte : IMP-1 (bannir le throw 401 inline repo-wide via règle ESLint).
- PROCHAIN ITEM : Décortiqué #1 du cours A → `ThreeStateCircuit` (commit 8504b1e8,
  museum-backend/src/shared/circuit-breaker/three-state-circuit.ts).

MÉTHODE (impérative) :
- Enseigne UN item à la fois, puis fais une pause pour qu'on discute. Pas de déballage massif.
- VÉRIFIE le code réel avant d'enseigner : `git show <SHA>` + Read du fichier final, cite des
  `path:line` réels. N'invente JAMAIS d'extrait de code (incident connu : la 1re version du cours A
  avait reconstruit BaseModal de mémoire → corrigé). Distingue « le code dit X » (vérifié) de
  « je suppose X » (non vérifié). Honnêteté UFR-013.
- Style explicatif : insère des encarts `★ Insight ──` (2-3 points pédagogiques spécifiques au code).
- Réponds en FRANÇAIS, accents corrects.

BOUCLE DE CAPTURE (à chaque item discuté) :
- Ajoute mes nouvelles questions dans la §1 de learning/2026-05-28-weekly/QUESTIONS-AND-IMPROVEMENTS.md.
- Ajoute toute amélioration de code révélée dans la §2 (ID IMP-N : problème, fix proposé, alternative,
  décision de design à trancher, statut).
- NE modifie PAS le code applicatif directement. Les améliorations sont un backlog ; quand je dis
  « on implémente IMP-N », on passe par le pipeline /team (UFR-022 fresh-context 5-phase).

Commence par me proposer de reprendre au PROCHAIN ITEM (ThreeStateCircuit), ou demande-moi si je
veux un autre point d'entrée.
```

---

## Avancement (tenu à jour par l'agent au fil des sessions)

- [x] **A.0** — Pourquoi refactorer avant un launch (3 dettes : duplication / divergence silencieuse / surface d'audit).
- [x] **A.1** — Technique « extract helper + sweep » + définition du codemod.
- [x] **A.2** — Sentinel décortiqué (cas `route-discipline-requireUser-codemod.test.ts`) : scan filesystem, regex négative stricte + anti-triche lâche, assertion positive d'import, sanity-check du compte, frozen-test.
- [ ] **A · Décortiqué #1** — `ThreeStateCircuit` (FSM CLOSED/OPEN/HALF_OPEN, transition lazy, Strategy, reset vs resetTransient). ← **PROCHAIN**
- [ ] **A · Décortiqué #2** — Redis Lua atomique (rate-limit `INCR_EXPIRE_LUA`).
- [ ] **A · Décortiqué #3** — probabilistic-refresh / XFetch (anti cache-stampede).
- [ ] **A · Décortiqué #4** — codemods `requireUser` / `notFound` (mécanique du sweep).
- [ ] **A · Décortiqué #5** — Web `BaseModal` + `useFetchData` (React 19, AbortController).
- [ ] **Thème C** — Pipeline chat (non commencé).
- [ ] **Thème B** — RGPD/PII/consent (non commencé).
- [ ] **Thème D+E** — Coûts & multi-tenant (non commencé).
