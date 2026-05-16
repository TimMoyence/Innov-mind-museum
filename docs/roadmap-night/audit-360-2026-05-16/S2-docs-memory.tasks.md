# S2 docs+memory+skills+comments — Follow-up tasks (J-16 launch)

**Date** : 2026-05-16. Source : `.claude/skills/team/team-reports/working/2026-05-16-audit-360/S2-docs-memory-signalnoise.md`.
**Scope** : décisions/cleanup hors confiance ≥90% directe. À traiter par dev session avec user-in-the-loop.

---

## T-S2-1 — Décider sort 3 fichiers docs/ untracked

**Fichiers** :
- `docs/ARCHITECTURE.md` (8.8 KB, créé 2026-05-07, jamais committé)
- `docs/LINT_DISCIPLINE.md` (3.7 KB, créé 2026-05-07, jamais committé)
- `docs/TEST_FACTORIES.md` (3.4 KB, créé 2026-05-07, jamais committé)

**Problème** : drift UFR-013. CLAUDE.md (lignes 103, ~242, ~254) prétend "not yet extracted" mais les 3 fichiers existent.

**Options** :
- **(A)** `git add` + commit. Update CLAUDE.md pour retirer "not yet extracted" et pointer vers les 3 docs. Update DOCS_INDEX.md.
- **(B)** `rm` les 3 si c'étaient des stubs abandonnés. Laisser CLAUDE.md inchangé.

**Action** : inspecter contenu des 3 fichiers → décider A ou B → exécuter. Effort : 15-30 min.
**Owner** : user/dev.

---

## T-S2-2 — Renommer ADR-050 triplicité

**Problème** : 3 ADRs partagent l'ID 050 — ambiguité pour toolchain + référencement.

**Fichiers** :
- `docs/adr/ADR-050-accept-langfuse-v3-eol.md` (2026-05-13)
- `docs/adr/ADR-050-oss-guardrail-providers-ready.md` (2026-05-13)
- `docs/adr/ADR-050-user-suspend-softdelete.md` (2026-05-14)

**Action** :
1. Garder le premier en ADR-050 (ordre commit).
2. Renommer `ADR-050-oss-guardrail-providers-ready.md` → `ADR-051-oss-guardrail-providers-ready.md`.
3. Renommer `ADR-050-user-suspend-softdelete.md` → `ADR-052-user-suspend-softdelete.md`.
4. Update DOCS_INDEX.md.
5. Grep le repo pour anciennes refs `ADR-050-oss-guardrail` / `ADR-050-user-suspend` → ajuster.

Effort : 30 min. Confidence cleanup : 95%.

---

## T-S2-3 — Décider sort 5 skills user-slash 0 agent invocations

**Skills (lignes, statut)** :
- `.claude/skills/recap/` (68 L) — `/recap` Daily Recap Musaium
- `.claude/skills/test-routes/` (84 L) — `/test-routes` validation API
- `.claude/skills/test-writer/` (89 L) — `/test-writer` generation tests
- `.claude/skills/verify-schema/` (79 L) — `/verify-schema` audit TypeORM
- `.claude/skills/security-scan/` (97 L) — `/security-scan` audit léger

**Problème** : 0 invocations dans `.claude/skills/team/team-reports/working/*`. Mais ce sont des commands user-facing — peut-être appelés directement par user en CLI.

**Action** :
1. User confirme usage récent (oui = keep, non = DELETE).
2. Si DELETE : `git rm -rf` + update CLAUDE.md commandes section si listé.

Effort : 10 min (décision) + 5 min (exec). UFR-016 si dead.

---

## T-S2-4 — Purger working/ orphelin 2026-05-05-recap-investigation

**Path** : `.claude/skills/team/team-reports/working/2026-05-05-recap-investigation/`
**Contents** : 4 review reports (code, security, doc, package) = 195 KB.
**Age** : 11 jours (last-mod 2026-05-05). Inside 30-day window mais clairement non-fermé (pas de README/state.json/closure marker).

**Action** :
1. Inspecter si findings actionnés ailleurs (TECH_DEBT.md, audit-2026-05-12) → si oui, `git rm -rf` ; si non, promouvoir en `team-reports/` archive.

Effort : 15-30 min (review contenu). UFR-016 + règle CLAUDE.md team reports lifecycle.

---

## T-S2-5 — CLAUDE.md slim : retirer "not yet extracted" (couplé T-S2-1)

**Couplé à T-S2-1.** Si docs commits OK :

**Edits CLAUDE.md** :
- L103 (§Architecture) : retirer phrase `> \`docs/ARCHITECTURE.md\` is referenced in older docs but not yet extracted. The summary below + the per-app \`src/\` tree are the source of truth.` → remplacer par `> Architecture détaillée : \`docs/ARCHITECTURE.md\`. Résumé :`
- §Test Discipline (~L242) : retirer `Le doc séparé \`docs/TEST_FACTORIES.md\` est référencé mais pas encore extrait — pour l'instant, lis directement les factories.` → `Voir aussi \`docs/TEST_FACTORIES.md\`.`
- §ESLint Discipline (~L254) : retirer `Le doc séparé \`docs/LINT_DISCIPLINE.md\` est référencé mais pas encore extrait.` → `Voir aussi \`docs/LINT_DISCIPLINE.md\`.`

**Économie** : ~40 tokens/session.

Effort : 10 min.

---

## T-S2-6 — Updater CLAUDE.md "Note 2026-05-15" — déclarer cleanup S2 absorbé

**Path** : `/Users/Tim/.claude/projects/-Users-Tim-Desktop-all-dev-Pro-InnovMind/memory/MEMORY.md` (bas du fichier).

**Action** : ajouter note `> **Note 2026-05-16** — 6 skills knowledge supprimés par audit S2 (langchain-* x3, pentest-checklist, vulnerability-scanner, browser-use). 2025 LOC dead code burial.`

Effort : 2 min.

---

## T-S2-7 — TODO Instagram handle supportLinks.ts

**Path** : `museum-frontend/shared/config/supportLinks.ts:14`
**TODO** : `Replace with real production Instagram handle once created.`

**Action** : créer compte Instagram production Musaium → remplacer placeholder → supprimer TODO.

Effort : 30 min (création compte) + 5 min (update code). Blocker B2C launch ?

---

## T-S2-8 — Closer P0 audit 2026-05-12 (DPIA/ROPA, cost cap, locales)

**Source** : `docs/audit-2026-05-12/MASTER.md` — 5 P0 ouverts depuis 2026-05-12.

**Items** :
- P0-1 : DPIA + ROPA DPO signature (legal/, last-mod 2026-05-13)
- P0-2 : Déclaration EAA/WCAG 2.1 AA full audit
- P0-4 : Plafond OpenAI + kill-switch (`COST_LIMIT_*` env vars)
- P0-5 : SUPPORTED_LOCALES sync BE/FE/Web (Zod auth bloque ['fr','en'] → AR signup 400)
- P0-7 : zombie no-op auth exports (`museum-web/src/lib/api.ts:38-56`)
- P0-8 : `JwksResponse`+`GoogleTokenResponse` Zod validation

**Effort** : 5-7 jours pour les 6. **CRITIQUE pour launch 2026-06-01.**

---

## T-S2-9 — Audit Subagent B wiki-link false positive — pas d'action requise

**Pour info** : Subagent B a marqué 3 wiki-style `[[name]]` dans memory comme bugs. Faux. CLAUDE.md user-global documente : `[[name]]` est la syntaxe canonique, "Link liberally — a `[[name]]` that doesn't match an existing memory yet is fine".

**Action** : aucune. Documenté ici pour traçabilité (UFR-013).

---

## T-S2-10 — Lancer gitnexus_detect_changes après suppression 6 skills

**Pourquoi** : vérifier qu'aucune cross-référence dans le repo ne pointait vers les 6 skills supprimés (langchain-fundamentals, langchain-middleware, langchain-rag, pentest-checklist, vulnerability-scanner, browser-use).

**Action** : `mcp__gitnexus__detect_changes` après commit S2.

Effort : 5 min. Best-practice CLAUDE.md GitNexus block.
