# Agent Mandate — V12 Template & Allocation

Protocole de construction des mandats agents et règles d'allocation pour les 6 rôles V12 (architect / editor / verifier / security / reviewer / documenter).

---

## TEMPLATE MANDAT

Chaque agent reçoit un mandat formel avec cette structure (tokens-budgétée — concision avant complétude) :

```
## MANDAT — {role} — {task_description}

### CONTEXTE
- Mode: {feature|bug|mockup|refactor|hotfix|chore|audit}
- Pipeline: {micro|standard|enterprise}
- Run ID: {YYYY-MM-DD-slug}
- Branche: {branch}
- Start commit: {sha} (gel scope par diff vs ce commit)
- Baseline: tsc=PASS, BE-tests=N passed, FE-tests=N, WEB-tests=N, as-any=0

### ROLE & MODEL
- Role: {architect|editor|verifier|security|reviewer|documenter}
- Model: opus-4.7 (architect, reviewer) | opus-4.6 (editor, verifier, security, documenter) — UFR-010
- Read scope: tous les fichiers du repo + .claude/agents/shared/*
- Write scope: {scope précis selon role — voir tableau ci-dessous}

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
- NE PAS bypasser un hook (post-edit-lint, post-edit-typecheck, pre-complete-verify)
- NE PAS produire un handoff brief > 200 tokens (~800 chars) — gate FAIL sinon

### COHERENCE IMPORTS (OBLIGATOIRE pour editor)

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

## ROLES V12 — WRITE SCOPE & TOOLS

| Role | Model | Write scope | Forbidden |
|---|---|---|---|
| **architect** | opus-4.7 | `team-state/<RUN_ID>/{spec,design,tasks}.md`, `team-state/<RUN_ID>/handoffs/*.json` | Source code, deploy, git commit |
| **editor** | opus-4.6 | Source code (museum-{backend,frontend,web}/), CI workflows (.github/workflows/), migrations via CLI, `team-state/<RUN_ID>/handoffs/*.json` | git commit, deploy/SSH/EAS submit, generated/openapi.ts manual edit |
| **verifier** | opus-4.6 | Read-only on code. `state.json.gates[]` via deterministic hooks only. | Edit/Write source, git commit |
| **security** | opus-4.6 | Read-only. Reports to STORY.md via documenter handoff. | Edit/Write code, git commit |
| **reviewer** | opus-4.7 (fresh-context) | Read-only. STORY.md `review` section append. | Edit/Write code, git commit, sycophancy (UFR-013) |
| **documenter** | opus-4.6 | `docs/`, `README*.md`, `CHANGELOG.md`, `STORY.md`, ADR (`docs/adr/`) | Source code, team-knowledge/, team-reports/ |

allowedTools sont déclarés dans le frontmatter de chaque agent (`.claude/agents/<role>.md`). Tous ont :
- `Read`, `Grep`, `Glob`, `Bash`, `WebFetch`, `WebSearch`
- `mcp__gitnexus__*` (query, context, impact, detect_changes, route_map, etc.)
- `mcp__serena__*` (find_symbol, find_referencing_symbols, get_diagnostics_for_file, etc.)
- `mcp__repomix__*` quand pertinent

---

## ARCHITECT/EDITOR SPLIT (V12 §1.3 + §3)

Pattern Aider Architect Mode adapté Musaium (all-Opus override par UFR-010). Le split sépare planification et implémentation pour réduire les boucles correctives :

### Phase architect (Opus 4.7) — plan-only

1. Cache warm-up : 1 appel séquentiel avec full prefix (cache_control: ephemeral) avant tout fan-out parallèle. Évite le 5-10× cost blow-up Anthropic prompt-caching.
2. Lecture spec/design/tasks templates + KB pertinents.
3. `mcp__gitnexus__query` pour mapper la demande aux modules existants.
4. `mcp__gitnexus__impact` pour blast-radius sur symboles touchés (HIGH/CRITICAL → flag user).
5. Production des 3 fichiers : `spec.md` (EARS + NFR + Glossary + Stakeholders), `design.md` (hexagonal mapping + observability §10), `tasks.md` (T-IDs atomiques avec DONE-WHEN).
6. Handoff brief ≤200 tokens vers editor (refs > inline content).

### Phase editor (Opus 4.6) — implementation

1. Consomme tasks.md top-down + handoff brief.
2. Pour chaque task : `gitnexus_impact` upstream → edit/write → `post-edit-lint.sh` + `post-edit-typecheck.sh` → si FAIL boucle corrective (cap 2).
3. Préférence Serena `replace_symbol_body` / `insert_after_symbol` sur Edit text quand symbole précis.
4. `gitnexus_detect_changes()` avant de marquer task done — vérifier scope.
5. Append STORY.md section `implement` + handoff brief vers verifier.

### Pourquoi ce split

- **Quality lift** (Aider mesure ~30% sur SWE-bench) — architect ne se précipite pas dans l'implémentation, voit le big picture.
- **Cost** : avec Sonnet editor c'était -3× cost. Avec Opus 4.6 editor (UFR-010), cost neutral vs v4. Économies réelles V12 viennent de cache warm-up + handoff brief shrinkage + APC plan reuse.
- **Honesty (UFR-013)** : architect produit le contrat, editor le suit. Si editor diverge, le diff vs spec.md est vérifiable par reviewer en fresh-context.
- **Failure isolation** : un editor qui échoue n'invalide pas le plan ; on relance editor sur même tasks.md.

---

## VIABILITE PRE-SPAWN

Avant de spawner un agent, le Tech Lead vérifie :

```
1. Le RUN_ID est généré et state.json initialisé (version: 1, status: initializing) ?
2. Le scope est clair et délimité (write scope du role respecté) ?
3. Les fichiers référencés existent (pas de hallucination de paths) ?
4. Le mandat est complet (objectif + contraintes + références + UFR-013) ?
5. Le handoff brief amont est ≤200 tokens (vérifié par compte de chars/4) ?
6. Cache warm-up effectué pour ce run (single warm call avant fan-out) ?
```

Si un critère n'est pas rempli → ne PAS spawner, corriger d'abord.

---

## ALLOCATION

| Mode | Pipeline | Roles invoqués |
|---|---|---|
| `feature` | standard / enterprise | architect → editor → verifier → reviewer → (documenter si ADR) |
| `bug` | micro / standard | editor → verifier → reviewer |
| `mockup` | micro | architect (UI sketch) → editor (composant) → reviewer |
| `refactor` | standard / enterprise | architect → editor → verifier → reviewer |
| `hotfix` | micro | editor → verifier (skip architect/reviewer pour vélocité, escalade si scope >5 fichiers) |
| `chore` | micro | editor (skip architect/reviewer si pure deps/docs) |
| `audit` | audit | reviewer + security (no editor) |
| `enterprise` (security-sensitive) | enterprise | architect → editor → verifier → security → reviewer → documenter |

---

## REGLES ABSOLUES

1. Tous les agents en `model: opus-4.7` (architect, reviewer) ou `opus-4.6` (editor, verifier, security, documenter) — UFR-010 + V12 all-Opus
2. Les agents ne commitent PAS — seul le Tech Lead `git add/commit/push`
3. Les agents n'écrivent PAS dans `team-knowledge/` ni `team-reports/`
4. Chaque agent reçoit un mandat complet avant spawn (template ci-dessus)
5. Un agent qui dépasse son write scope → modifications hors scope revertées par le Tech Lead
6. Un agent qui ajoute un `eslint-disable` hors allowlist OU sans `Justification:` + `Approved-by:` → FAIL de porte
7. Un agent qui crée des entités de test inline → FAIL de review (UFR-002 shape-match)
8. Un agent qui fabrique un fait/chiffre/citation/path/ligne → FAIL severité-5 + score 0/10 (UFR-013)
9. Reviewer JAMAIS spawné dans le même contexte que editor (V12 §8 anti-pattern rubber stamp)
10. Cap 2 boucles correctives par phase → escalade utilisateur (V12 §8)
