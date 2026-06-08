# Agent Mandate — V13 Template (UFR-022 fresh-context)

Protocole de construction des mandats agents pour les **6 agents V13** (élagage 9→6 du 2026-05-31) : `architect`, `editor`, `doc-cache`, `security`, `reviewer`, `documenter`. La phase `verify` est un gate déterministe (hooks, sans agent).

> **Mode unique (UFR-022).** Plus de selecteur de mode (`feature`/`bug`/`mockup`/`hotfix`/`chore`/`audit`) ni de pipeline (`micro`/`standard`/`enterprise`). UN seul pipeline 9-phase pour toute modif code applicatif : spec → plan → doc-freshness → red → green → verify → security → review → documenter. Cf. SKILL.md REGLE 6 + ligne 672 (changelog v13.UFR-022).

---

## TEMPLATE MANDAT

Chaque agent reçoit un mandat formel avec cette structure (tokens-budgétée — concision avant complétude) :

```
## MANDAT — {role} — {phase} — {task_description}

### CONTEXTE
- Phase: {spec|plan|doc-cache|red|green|verify|security|review|documenter} (pipeline 8-phase unique, mode UFR-022 ; verify = gate hooks sans agent)
- Run ID: {YYYY-MM-DD-slug}
- Branche: {branch}
- Start commit: {sha} (gel scope par diff vs ce commit)
- Baseline: tsc=PASS, BE-tests=N passed, FE-tests=N, WEB-tests=N, as-any=0

### ROLE & MODEL
- Role: {architect|editor|doc-cache|security|reviewer|documenter}
- Model: opus-4.8 (tous les agents, tier unifié 2026-05-31) — UFR-010 all-Opus
- Read scope: tous les fichiers du repo + .claude/agents/shared/*
- Write scope: {scope précis selon role — voir tableau ci-dessous}

### FRESH-CONTEXT (UFR-022, obligatoire)
- Tu es spawné fresh-context : zéro message d'une autre phase du même RUN_ID dans ton historique.
- Première réponse = `BRIEF-ACK: <sha256_du_brief>` en preamble.
- Si tu détectes dans ton message history un artefact d'une autre phase → émets `BLOCK-CONTEXT-LEAK` et refuse. Le dispatcher re-spawn proprement.
- Tu lis les artefacts des phases précédentes UNIQUEMENT depuis le disque (read-only), jamais via un résumé inline.

### OBJECTIF
{description précise + livrable attendu, références aux artefacts du run}

### REFERENCES (handoff brief ≤200 tokens)
- spec.md: team-state/{run_id}/spec.md (sections pertinentes: §X.Y)
- design.md: team-state/{run_id}/design.md
- tasks.md: team-state/{run_id}/tasks.md (T-IDs assignés)
- handoff: team-state/{run_id}/handoffs/NNN-{from}-to-{role}.json

### CONTRAINTES
- Respect strict du write scope du role (cf. table ci-dessous)
- NE PAS commit (le Tech Lead commit)
- NE PAS écrire dans team-knowledge/ ni team-reports/
- NE PAS ajouter de deps sans validation Tech Lead
- NE PAS bypasser un hook (post-edit-lint, post-edit-typecheck, post-edit-green-test-freeze, pre-complete-verify)
- NE PAS produire un handoff brief > 200 tokens (~800 chars) — gate FAIL sinon

### LIB-DOCS OBLIGATION (red / green / reviewer — UFR-022, REGLE 15)

- Pour CHAQUE lib non-dev-only importée par le diff : consulter `lib-docs/<lib>/PATTERNS.md` + `LESSONS.md`.
- Cache stale (>14j OU version drift vs package.json OU manquant OU PATTERNS.md sha256 drift) → déclenche doc-cache (un fresh agent, fetch+curate). WebSearch fail (offline/404/rate-limit) → WARN + use stale + tag rapport (pas de BLOCK).
- Sortie JSON DOIT inclure `libDocsConsulted[]` couvrant les imports. Le gate verify hook `pre-phase-doc-reference-check.sh` BLOCK si la couverture est incomplète.
- Reviewer cite `PATTERNS.md:<line>` quand le code dévie d'un pattern documenté → CHANGES_REQUESTED.

### FROZEN-TEST (green — UFR-022, REGLE 16)

- La phase Red écrit `red-test-manifest.json` `{path: sha256}`. La phase Green ne peut modifier AUCUN byte d'un test du manifest.
- Hook `post-edit-green-test-freeze.sh` re-hash chaque test après chaque edit ; mismatch sha256 = exit 1 STOP.
- Si Green pense qu'un test est buggé → émettre `BLOCK-TEST-WRONG <file>:<line> <reason>` SANS toucher le fichier → le dispatcher re-spawn fresh la phase Red avec le finding.

### COHERENCE IMPORTS (OBLIGATOIRE pour editor phase=green)

AVANT de modifier/supprimer/renommer un symbole ou fichier :
1. `gitnexus_impact({target: "symbolName", direction: "upstream"})`
2. Lire dépendants d=1 (WILL BREAK)
3. Si d=1 dans ton scope → inclure dans tes modifications
4. Si d=1 hors scope → FLAG comme Discovery (NE PAS modifier)
5. NE JAMAIS supprimer un fichier sans `gitnexus_context` sur ses importers
6. NE JAMAIS renommer sans `gitnexus_rename({dry_run: true})` d'abord
7. Préférence : `mcp__serena__rename_symbol` (call-graph aware) sur find-and-replace
8. Préférence : `mcp__serena__replace_symbol_body` sur Edit pour modifs ciblées

LOG OBLIGATOIRE dans le rapport :
```
### GitNexus Calls Log
- gitnexus_impact({target: "X", direction: "upstream"}) → N dépendants d=1, traités: [liste]
- gitnexus_context({name: "Y"}) → N importers, traités: [liste]
- gitnexus_rename({symbol_name: "Z", dry_run: true}) → N fichiers touchés
```
Si aucun symbole existant modifié → écrire: "Aucun symbole existant modifié — 0 appels GitNexus requis".
Verifier vérifie ce log. Absence = FAIL de porte.

### REGLES TECHNIQUES

**ESLint (UFR-003 + Phase 0 hard rule)** : ne JAMAIS ajouter `eslint-disable` sauf pour les catégories autorisées dans CLAUDE.md § "ESLint Discipline > Justified disable patterns" ET avec `Justification:` + `Approved-by:` dans le commentaire (Phase 0 PR-validation rule).

**Tests DRY (UFR-002 + Phase 7)** : ne JAMAIS créer d'entités de test inline (`as User`, `as ChatMessage`, etc.). TOUJOURS factories partagées de `tests/helpers/<module>/<entity>.fixtures.ts` (BE) ou `__tests__/helpers/factories/` (FE). Manque de factory → la créer AVANT de l'utiliser.

**Honnêteté (UFR-013)** : pas de fabrication de fichiers/symboles/CVE/sources externes. WebFetch/WebSearch/Read/Bash AVANT d'asserter. "Je ne sais pas" est valide. Échecs reportés verbatim, pas de minimisation.

**No-emoji (feedback_no_unicode_emoji)** : pas d'unicode emoji dans le code RN/Web. PNG (require) + Ionicons uniquement.

### PROMPT ENRICHMENTS (PE)
{enrichissements injectés depuis prompt-enrichments.json, filtrés par inject_when}

### ERROR PATTERNS (EP)
{erreurs passées pertinentes depuis error-patterns.json, unfixed only}

### OUTPUT ATTENDU
{format de sortie attendu — fichiers modifiés + rapport structuré + handoff brief vers le role suivant}
```

---

## ROLES V13 — WRITE SCOPE & TOOLS

| Role | Model | Write scope | Forbidden |
|---|---|---|---|
| **architect** | opus-4.8 | `team-state/<RUN_ID>/{spec,design,tasks}.md`, `team-state/<RUN_ID>/handoffs/*.json`. Spawné 2× : phase=spec → `spec.md` only ; phase=plan → `design.md` + `tasks.md` only. | Source code, deploy, git commit |
| **editor** | opus-4.8 | Source code (museum-{backend,frontend,web}/), CI workflows (.github/workflows/), migrations via CLI, tests, `team-state/<RUN_ID>/handoffs/*.json`. Spawné 2× : phase=red → tests FAIL + `red-test-manifest.json` ; phase=green → code applicatif (frozen-test, ne touche AUCUN test du manifest). | git commit, deploy/SSH/EAS submit, generated/openapi.ts manual edit, modifier un test frozen en phase green |
| **security** | opus-4.8 | Read-only. Reports to STORY.md via documenter handoff. Toujours présent (mode unique). | Edit/Write code, git commit |
| **reviewer** | opus-4.8 (fresh-context) | Read-only. STORY.md `review` section append. Absorbe (ex-verifier) scope-boundary vs plan + spot-check du fichier le plus risqué + DoD-confirmation + `libDocsConsulted[]` assertion. Rejection loop ILLIMITÉ (REGLE 14). | Edit/Write code, git commit, sycophancy (UFR-013) |
| **documenter** | opus-4.8 | `docs/`, `README*.md`, `CHANGELOG.md`, `STORY.md`, ADR (`docs/adr/`). Toujours présent (mode unique). | Source code, team-knowledge/, team-reports/ |
| **doc-cache** | opus-4.8 | `lib-docs/<lib>/` (snapshot + sources.json + VERSION + `PATTERNS.md`). Fetch PUIS curate en un seul spawn. Parallélisable par lib (read-only sur source). | Edit source, `LESSONS.md`, `INDEX.json`, git commit |

allowedTools sont déclarés dans le frontmatter de chaque agent (`.claude/agents/<role>.md`). Tous ont :
- `Read`, `Grep`, `Glob`, `Bash`, `WebFetch`, `WebSearch`
- `mcp__gitnexus__*` (query, context, impact, detect_changes, route_map, etc.)
- `mcp__serena__*` (find_symbol, find_referencing_symbols, get_diagnostics_for_file, etc.)
- `mcp__repomix__*` quand pertinent

---

## SPLIT FRESH-CONTEXT (UFR-022) — architect spec/plan + editor red/green

UFR-022 sépare CHAQUE phase en un spawn fresh-context distinct. L'architect spawne 2× (spec puis plan), l'editor spawne 2× (red puis green). Aucun spawn ne voit le context d'un autre. La séparation ferme deux raccourcis structurellement : le rubber-stamp (reviewer dans le context de l'editor) et le test-self-serving (editor qui rend ses tests verts en touchant le test).

### Phase spec — architect #1 (Opus 4.8), fresh-context

1. Lecture des templates spec + KB pertinents + `roadmap-context.json` (read-only).
2. `mcp__gitnexus__query` pour mapper la demande aux modules existants.
2b. **CLUSTER SKILLS (cf. `gitnexus-integration.md` § CLUSTER SKILLS)** : `node scripts/gen-cluster-skills-index.mjs --route <fichiers du scope>` → Read la/les carte(s) `.claude/skills/generated/<cluster>/SKILL.md` retournée(s) pour la vue domaine (entry points + symboles structurants) AVANT de rédiger la spec. Citer "cluster <name> consulté". Fail-open si index absent.
3. `mcp__gitnexus__impact` pour blast-radius sur symboles touchés (HIGH/CRITICAL → flag user).
4. Production de `spec.md` UNIQUEMENT (EARS + NFR + Glossary + Stakeholders + acceptance criteria). **Pas de design, pas de tasks, pas de code.**
5. Handoff brief ≤200 tokens vers la phase plan (refs > inline content).

### Phase plan — architect #2 (Opus 4.8), fresh-context, zéro mémoire de spec

1. Lit `spec.md` depuis le disque (jamais via résumé inline).
2. Production de `design.md` (hexagonal mapping + observability §10) + `tasks.md` (T-IDs atomiques avec DONE-WHEN). Le `tasks.md` contient `## Multi-cycle progress` pour features long-running.
3. Handoff brief ≤200 tokens vers la phase red.

### Phase red — editor #1 (Opus 4.8), fresh-context

1. Lit `spec.md` + `design.md` + `tasks.md` depuis le disque + handoff brief.
1b. CLUSTER SKILLS : `node scripts/gen-cluster-skills-index.mjs --route <fichiers de tasks.md>` → Read la/les carte(s) du domaine pour situer les fixtures/entry points existants (fail-open).
2. Consulte `lib-docs/<lib>/PATTERNS.md` + `LESSONS.md` pour chaque lib importée (REGLE 15).
3. Produit des tests qui **FAIL** (prouve absence feature / présence bug). `pnpm test` exit ≠ 0 = succès de la phase.
4. Écrit `red-test-manifest.json` `{path: sha256}` figeant chaque test produit.
5. Handoff brief vers la phase green (refs + chemin du manifest).

### Phase green — editor #2 (Opus 4.8), fresh-context, zéro mémoire de red

1. Lit le diff red depuis le disque + le manifest.
1b. CLUSTER SKILLS : `node scripts/gen-cluster-skills-index.mjs --route` (sans arg = diff courant) → Read la/les carte(s) du domaine pour réutiliser les symboles/patterns existants au lieu d'en réinventer (fail-open).
2. Consulte `lib-docs/<lib>/PATTERNS.md` (REGLE 15).
3. Pour chaque task : `gitnexus_impact` upstream → edit/write code APPLICATIF → `post-edit-lint.sh` + `post-edit-typecheck.sh` + `post-edit-green-test-freeze.sh` → si FAIL boucle corrective **intra-phase (cap 2 — hook fails uniquement)**.
4. **FROZEN-TEST byte-for-byte** : ne touche AUCUN test du manifest. Si un test paraît buggé → `BLOCK-TEST-WRONG <file>:<line> <reason>` SANS toucher → re-spawn fresh phase red.
5. Préférence Serena `replace_symbol_body` / `insert_after_symbol` sur Edit text quand symbole précis.
6. `gitnexus_detect_changes()` avant de marquer task done — vérifier scope.
7. Append STORY.md section `implement` + handoff brief vers le gate verify (hooks) puis security/reviewer.

### Pourquoi ce split

- **Anti-rubber-stamp + anti-self-serving** : un agent qui teste son propre code rend les tests verts en touchant le test, pas le code. Red écrit le contrat (tests FAIL), green le satisfait sans pouvoir le réécrire (frozen-test). Le reviewer en fresh-context vérifie le diff vs spec.md sans biais.
- **Quality lift** : spec/plan séparés → l'architect ne se précipite pas dans l'implémentation, voit le big picture.
- **Honesty (UFR-013)** : architect produit le contrat, editor le suit ; toute divergence est vérifiable par diff.
- **Failure isolation** : un editor green qui échoue n'invalide ni le plan ni les tests red ; on relance green sur les mêmes artefacts gelés.

---

## VIABILITE PRE-SPAWN

Avant de spawner un agent, le Tech Lead vérifie :

```
1. Le RUN_ID est généré et state.json initialisé (version: 1, status: initializing) ?
2. Le scope est clair et délimité (write scope du role respecté) ?
3. Les fichiers référencés existent (pas de hallucination de paths) ?
4. Le mandat est complet (objectif + contraintes + références + UFR-013) ?
5. Le handoff brief amont est ≤200 tokens (vérifié par compte de chars/4) ?
6. Le spawn est fresh-context (aucun message d'une autre phase du RUN_ID dans l'historique) ?
7. Pour red/green/reviewer : `lib-docs/<lib>/PATTERNS.md` est frais (≤14j, pas de version drift) ? sinon doc-freshness d'abord.
```

Si un critère n'est pas rempli → ne PAS spawner, corriger d'abord.

---

## PIPELINE UNIQUE 9-PHASE (UFR-022)

Plus de mode ni de pipeline sélectionnable. Toute modif code applicatif traverse les mêmes phases, dans l'ordre. Chaque phase = un spawn fresh-context.

| # | Phase | Agent | Output |
|---|---|---|---|
| 1 | spec | architect #1 | `spec.md` |
| 2 | plan | architect #2 | `design.md` + `tasks.md` |
| 2.5 | doc-cache | doc-cache (si stale/drift/missing) | `lib-docs/<lib>/{snapshot,PATTERNS.md}` |
| 3 | red | editor #1 | tests FAIL + `red-test-manifest.json` |
| 4 | green | editor #2 | code applicatif (frozen-test) |
| 5 | verify | *gate déterministe (hooks, sans agent)* | `state.json.gates[]` + `libDocsConsulted[]` check ; scope-boundary + spot-check délégués au reviewer |
| 6 | security | security | findings (toujours présent) |
| 7 | review | reviewer | verdict APPROVED / CHANGES_REQUESTED / BLOCK (rejection loop ILLIMITÉ) |
| 8 | documenter | documenter | docs / ADR / STORY.md (toujours présent) |

> **Exemption auto** : si `git diff --name-only` ∩ `{museum-backend/src/**, museum-frontend/{app,features,shared,components}/**, museum-web/src/**, tests/}` est vide → pipeline skippé (pure-doc edit), run direct finalize. Cf. `pre-phase-pure-doc-check.sh`.
>
> **Élagage 9→6 (2026-05-31)** : `doc-fetcher`+`doc-curator` → `doc-cache` ; `verifier` retiré (gates → hooks, jugement → reviewer) ; `learning-curator` retiré (0 amendement en 77 runs). `security` conservé.

---

## REGLES ABSOLUES

1. Tous les agents en `model: claude-opus-4-8` (frontmatter explicite, tier unifié 2026-05-31) — UFR-010 all-Opus sans exception, aucun Sonnet
2. Les agents ne commitent PAS — seul le Tech Lead `git add/commit/push`
3. Les agents n'écrivent PAS dans `team-knowledge/` ni `team-reports/`
4. Chaque agent reçoit un mandat complet avant spawn (template ci-dessus)
5. Un agent qui dépasse son write scope → modifications hors scope revertées par le Tech Lead
6. Un agent qui ajoute un `eslint-disable` hors allowlist OU sans `Justification:` + `Approved-by:` → FAIL de porte
7. Un agent qui crée des entités de test inline → FAIL de review (UFR-002 shape-match)
8. Un agent qui fabrique un fait/chiffre/citation/path/ligne → FAIL severité-5 + score 0/10 (UFR-013)
9. **Fresh-context obligatoire (UFR-022, SKILL.md REGLE 6+13)** : chaque phase = un Agent spawn fresh, zéro message d'une autre phase dans son context. `BRIEF-ACK: <sha256>` en première réponse ; `BLOCK-CONTEXT-LEAK` si leak détecté → re-spawn propre. Reviewer JAMAIS spawné dans le même context que editor (anti-rubber-stamp).
10. **Cap 2 boucles = intra-phase hook fails UNIQUEMENT (UFR-022, SKILL.md REGLE 14)** : `state.json.telemetry.intraPhaseHookLoops >= 2` (lint/tsc/test fails dans la MÊME phase éditeur) → STOP + escalade user. **Reviewer rejection loop = ILLIMITÉ** (zéro cap, zéro warning auto). Re-spawn fresh la phase pointée (spec/plan/red/green).
11. **Lib-docs obligation (UFR-022, SKILL.md REGLE 15)** : red/green/reviewer consultent `lib-docs/<lib>/PATTERNS.md` + `LESSONS.md` ; `libDocsConsulted[]` vérifié par `pre-phase-doc-reference-check.sh` (gate verify). Stale → doc-cache.
12. **Frozen-test (UFR-022, SKILL.md REGLE 16)** : red écrit `red-test-manifest.json` ; green ne touche aucun byte d'un test du manifest (`post-edit-green-test-freeze.sh` enforce). Test buggé → `BLOCK-TEST-WRONG` sans toucher, re-spawn fresh red.
