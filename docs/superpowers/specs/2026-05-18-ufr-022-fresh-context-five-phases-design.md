# Design — UFR-022 : Fresh-context 5-phase + lib-docs cache + /team mode unique

> Date: 2026-05-18
> Status: draft → user review
> Replaces: V12 §8 cap policy (partial), Step 4 closing gate keywords, /team pipeline selector (micro/standard/enterprise)
> Twin rules: UFR-013 (honnêteté), UFR-021 (post-feature test coverage), UFR-020 (zero bypass)

## 1. Problème

Aujourd'hui :
- `/team` a 7 modes (`feature` / `bug` / `mockup` / `refactor` / `hotfix` / `chore` / `audit`) + 3 pipelines (`micro` / `standard` / `enterprise`) avec keywords de bypass Spec Kit (`typo`, `dep bump`, etc.). Le résultat : "qu'est-ce qui passe vraiment par le pipeline complet ?" varie d'un run à l'autre, et un agent peut décider unilatéralement de skipper Spec Kit.
- `architect` produit `spec.md + design.md + tasks.md` dans **un seul spawn**. Le même agent fait spec + plan, donc rien ne sépare "qu'est-ce qu'on cherche" de "comment on le fait".
- `editor` produit l'impl dans **un seul spawn** : tests + code dans le même context. L'anti-pattern "rendre le test vert en touchant le test" n'est bloqué par aucune contrainte structurelle.
- Seul le `reviewer` est en fresh context. Les autres agents peuvent voir du contenu de phases précédentes via continuation.
- Aucune obligation pour les agents dev/review de consulter la **documentation officielle** des libs touchées. Les patterns appris par training sont potentiellement périmés (LangChain breaking changes Q2 2026, RN 0.83 hooks, etc.). Récemment un agent a déclaré "j'ai fait inline pour l'efficacité tokens" en violation du protocole.

## 2. Objectifs

1. **Fresh context obligatoire à chaque phase**, pas seulement reviewer. Defense-in-depth contre context leak + rubber stamp.
2. **Séparation byte-frozen tests vs code applicatif** : phase Red produit des tests qui FAIL ; phase Green produit le code qui les passe sans pouvoir modifier les tests d'un caractère.
3. **Doctrine workflow unique** : un seul pipeline pour tout modif code, plus de mode selector. Reproductibilité 100% — la spec/design/tasks docs sont produits à chaque run, jamais skippés.
4. **Obligation lib-docs** : tout agent qui touche du code applicatif ou review du code DOIT consulter la doc officielle (cache local + WebSearch refresh forcé > 14j ou version drift).
5. **Reviewer rejection loop illimité** : 20 boucles si nécessaire, zero garde-fou auto, zero mention. Si le reviewer rejette c'est qu'il y a raison.
6. **Cost gate** = telemetry pure, pas de seuil bloquant.

## 3. Non-objectifs

- Pas d'extension aux skills de pure lookup (`gitnexus-*`, `semgrep`, `codeql`, `keybindings-help`, etc.).
- Pas de remplacement du système quality-ratchet existant (coverage / mutation testing) — orthogonal.
- Pas de modification du protocole Langfuse telemetry (spans inchangés, sauf ajout `phase: spec|plan|red|green|review`).
- Pas d'auto-commit par les agents (REGLE ABSOLUE #3 préservée — Tech Lead seul commite).

## 4. Doctrine — UFR-022

Trois niveaux d'encodage, pattern UFR-013/UFR-020/UFR-021 :

```
UFR-022 (.claude/agents/shared/user-feedback-rules.json)
   ↕ twinned prose canonique
CLAUDE.md § Fresh-context 5-phase workflow (UFR-022)
   ↕ wired into
.claude/skills/team/SKILL.md (mode unique + 5-phase + lib-docs)
   ↕ propagated to
12 skills + agents .claude/agents/*.md + .claude/skills/{test-writer,verify-schema,security-scan,rollback,recap}/SKILL.md
```

### 4.1 UFR-022 rule text (canonique JSON)

```json
{
  "id": "UFR-022",
  "family": "orchestration",
  "source": "feedback_fresh_context_five_phases_2026_05_18",
  "rule": "Toute modif code applicatif + tests DOIT passer par 5 phases en fresh-context : spec → plan → red → green → review. Chaque phase = un agent spawné fresh (zero message d'une autre phase dans son context). Phase Red produit des tests failing. Phase Green produit le code qui les rend verts SANS modifier un byte des tests créés en Red (sha256 freeze enforced). Tout agent red/green/reviewer DOIT consulter lib-docs/<lib>/PATTERNS.md + LESSONS.md pour chaque lib importée par le diff ; cache stale (>14j OU version drift package.json) déclenche refresh obligatoire via doc-fetcher + doc-curator (double fresh agents). Reviewer rejection loop illimité (zero cap, zero warning). Cap 2 corrective loops s'applique UNIQUEMENT aux intra-phase hook failures (lint/tsc/test fails dans une même phase), pas aux reviewer rejections. Exemption auto si diff = 0 fichier code applicatif (pure-doc edits).",
  "severity": "BLOCK",
  "applyWhen": "Toute creation/modification de fichier matchant museum-backend/src/**/*.ts, museum-frontend/{app,features,shared,components}/**/*.{ts,tsx}, museum-web/src/**/*.{ts,tsx} OU tests associés",
  "exceptions": "Diff = 0 fichier code applicatif (markdown/docs/config only). Rename privé pure avec gitnexus_impact upstream=0 callers. Bump version manifest pur (package.json/lock files sans code touche). Edit .env*, .github/workflows/**, docs/**."
}
```

### 4.2 Prose canonique CLAUDE.md (section à ajouter)

Voir §11 (implementation diff).

## 5. Architecture — pipeline mode unique

```
INIT (Step 0-1)
  └─ Generate RUN_ID, parse description, capture .startCommit

CONTEXT (Step 2-3)
  └─ Cost estimate (telemetry only, no block)
  └─ Cache warm-up (single Anthropic prompt cache prefix)

PHASE 1 — SPEC (Step 4a)
  └─ Spawn architect.md FRESH
      ├─ inputs: description + roadmap-context.json + PATTERNS.md/LESSONS.md des libs déjà connues
      ├─ outputs: team-state/$RUN_ID/spec.md (EARS + NFR + glossary + stakeholders + acceptance criteria)
      └─ handoff: handoffs/001-spec-to-plan.json (≤200 tokens)

PHASE 2 — PLAN (Step 4b)
  └─ Spawn architect.md FRESH (different invocation, zero memory of phase 1)
      ├─ inputs: spec.md (read-only) + PATTERNS.md/LESSONS.md
      ├─ outputs:
      │     ├─ team-state/$RUN_ID/design.md
      │     └─ team-state/$RUN_ID/tasks.md  ← contient atomic tasks T1.1..Tn.x
      │                                       + section "## Multi-cycle progress"
      │                                       pour features long-running (run précédent peut laisser tasks pending)
      └─ handoff: handoffs/002-plan-to-red.json

PRE-PHASE — DOC FRESHNESS (Step 4.5)
  └─ pre-phase-doc-freshness.sh
      ├─ parse imports staged du diff (apparu/modifié dans tasks.md)
      ├─ pour chaque lib : 3-way check (package.json version vs INDEX.json.version vs sources.fetched < 14j)
      └─ si stale: enqueue refresh
  └─ Pour chaque lib à refresh:
      ├─ Spawn doc-fetcher.md FRESH (allowedTools: WebSearch+WebFetch+Write lib-docs/**)
      │     ├─ WebSearch "<lib> v<version> documentation"
      │     ├─ WebFetch 5-10 pages canoniques (intro, API, patterns, recipes, migration)
      │     └─ output: lib-docs/<lib>/snapshot-YYYY-MM-DD.md + sources.json + VERSION (untracked)
      └─ Spawn doc-curator.md FRESH (allowedTools: Read lib-docs/**+Write lib-docs/<lib>/PATTERNS.md)
            ├─ lit snapshot raw + LESSONS.md (read-only preserve)
            └─ output: lib-docs/<lib>/PATTERNS.md curated (untracked) + verdict JSON
  └─ Dispatcher (pas agent) update lib-docs/INDEX.json (tracked) avec {version, fetched, snapshotSha256, patternsSha256, sourceUrls, warnings} agrégés depuis sources.json + curator verdict

PHASE 3 — RED (Step 5a)
  └─ Spawn editor.md FRESH
      ├─ inputs: spec.md + design.md + tasks.md (read-only) + PATTERNS.md/LESSONS.md des libs
      ├─ workflow: write tests that MUST fail (prouve absence feature ou présence bug)
      ├─ verifier: pnpm test scoped exit != 0 = success de la phase
      ├─ output: tests files + red-test-manifest.json {path: sha256} pour freeze
      └─ handoff: handoffs/003-red-to-green.json

PHASE 4 — GREEN (Step 5b)
  └─ Spawn editor.md FRESH (zero memory of phase 3)
      ├─ inputs: spec/design/tasks + diff red (read-only sur les tests créés) + PATTERNS.md/LESSONS.md
      ├─ constraint: FROZEN-TEST byte-for-byte. Hook post-edit-green-test-freeze.sh re-hash chaque test.
      │   Mismatch sha256 vs red-test-manifest.json → exit 1 → STOP + escalade.
      │   Si agent pense test buggé: doit émettre BLOCK-TEST-WRONG + path + raison → re-spawn fresh phase 3.
      ├─ workflow: write code applicatif jusqu'à pnpm test exit == 0
      ├─ verifier: post-edit-lint + post-edit-typecheck (intra-phase cap 2 inchangé)
      └─ handoff: handoffs/004-green-to-verify.json

VERIFY (Step 6)
  └─ Spawn verifier.md FRESH
      ├─ inputs: spec/design + diff complet $startCommit..HEAD
      ├─ runs: pre-complete-verify.sh (tests scoped + STORY.md sha256 chain + gitnexus_detect_changes)
      └─ asserts: pre-phase-doc-reference-check.sh (red/green ont référencé lib-docs/<lib>/PATTERNS.md dans leur output)

SECURITY (Step 7) — toujours exécuté (mode unique, plus de skip)
  └─ Spawn security.md FRESH
      ├─ inputs: diff + lib-docs des libs critiques (auth/crypto/llm)
      └─ runs: promptfoo regression si chat touche + semgrep + Presidio output classifier

PHASE 5 — REVIEW (Step 8)
  └─ Spawn reviewer.md FRESH (V12 §8 fresh-context déjà enforced, inchangé)
      ├─ inputs: spec/design + full diff + PATTERNS.md/LESSONS.md des libs touchées
      ├─ checks:
      │     ├─ 5 axes scoresOnFiveAxes (T1.5 KR3 inchangé)
      │     ├─ déviation patterns documentés → cite PATTERNS.md:<line>
      │     ├─ context leak detection
      │     └─ green phase a-t-il modifié des tests ? (cross-check vs red-test-manifest.json)
      ├─ verdict: APPROVED | CHANGES_REQUESTED | BLOCK
      └─ si CHANGES_REQUESTED: re-spawn FRESH à la phase pointée (spec/plan/red/green)
            └─ reviewerRejectionLoops++ telemetry seule. Aucun cap. Zero warning.

DOCUMENTER (Step 8.5)
  └─ Spawn documenter.md FRESH
      ├─ append STORY.md section finale
      └─ post-complete-lesson-capture.sh (T2.1 inchangé)

FINALIZE (Step 9)
  └─ Tech Lead git add + commit (agents jamais)
  └─ Cost delta telemetry (T1.1 KR1 inchangé, mais plus de seuil)
```

### 5.1 Exemption pure-doc

Hook `pre-phase-pure-doc-check.sh` (renommé pour clarté, distinct du doc-freshness hook) détecte au Step 0 : examine `git diff --name-only` (working tree + staged) ∩ `{museum-backend/src/**, museum-frontend/{app,features,shared,components}/**, museum-web/src/**, tests/}`. Si l'intersection est vide ET la description user matche `mode in {chore, docs}` ou pas de mode explicite → skip tout le pipeline. Append STORY.md "skipped — pure-doc edit, no code files touched". Step 9 finalize direct. Si la description suggère du code mais le diff est vide → BLOCK + ask user "rien de modifié, quel run veux-tu lancer ?".

## 6. Lib-docs cache — spécification

### 6.1 Layout repo

```
lib-docs/
├── INDEX.json                          # TRACKED — single source of truth manifest
├── README.md                           # TRACKED — structure doc + interdit edits manuels sauf LESSONS.md
├── .gitignore                          # TRACKED — ignore snapshots/PATTERNS/sources/VERSION
├── react-native/
│   ├── LESSONS.md                      # TRACKED — human-edited project gotchas (jamais touché par agents)
│   ├── VERSION                         # UNTRACKED — = INDEX.json.<lib>.version (regenerable)
│   ├── snapshot-2026-05-18.md          # UNTRACKED — raw WebFetch dump 5-10 pages
│   ├── sources.json                    # UNTRACKED — {urls, fetched, fetcherAgent, warnings}
│   └── PATTERNS.md                     # UNTRACKED — curated by doc-curator
├── langchain/...
└── ...
```

### 6.2 INDEX.json schema

```json
{
  "version": "1.0",
  "lastUpdated": "2026-05-18T10:30:00Z",
  "libs": {
    "react-native": {
      "version": "0.83.0",
      "fetched": "2026-05-18T10:30:00Z",
      "fetchedBy": "doc-fetcher",
      "curatedAt": "2026-05-18T10:32:00Z",
      "curatedBy": "doc-curator",
      "snapshotSha256": "abc123...",
      "patternsSha256": "def456...",
      "sourceUrls": [
        "https://reactnative.dev/docs/0.83/getting-started",
        "https://reactnative.dev/docs/0.83/components-and-apis",
        "..."
      ],
      "warnings": []
    },
    "langchain": { "..." }
  }
}
```

### 6.3 Refresh triggers (3-way check)

Pour chaque lib touchée par le diff (parsé via imports) :

```
SHOULD_REFRESH = (
  package.json resolved version != INDEX.json.libs[lib].version
  OR sources.fetched < (now - 14d)
  OR PATTERNS.md absent localement
)
```

Si SHOULD_REFRESH → spawn doc-fetcher puis doc-curator.

### 6.4 doc-fetcher.md (agent fresh, nouveau)

- **Model** : opus-4.6 (read-heavy task, pas critique enough pour 4.7).
- **AllowedTools** : `WebSearch`, `WebFetch`, `Write` (path glob: `lib-docs/**`), `Read` (path glob: `lib-docs/**`, `package.json`, `pnpm-lock.yaml`, `museum-frontend/package.json`). **PAS** d'Edit (write-only pour empêcher partial mutation).
- **Input brief** : `{lib: "react-native", currentVersion: "0.83.0", lastFetched: "2026-04-01T..."}`.
- **Workflow** :
  1. WebSearch `"<lib> v<version> official documentation"` → identifie 5-10 URLs canoniques.
  2. WebFetch chaque URL séquentiellement (timeout 30s par fetch).
  3. Concat dans `lib-docs/<lib>/snapshot-YYYY-MM-DD.md` (avec headers `## Source: <url>` entre sections).
  4. Compute sha256 du snapshot, écrit `sources.json` `{urls, fetched, fetcherAgent: "doc-fetcher", sha256, warnings: []}`.
  5. Écrit `lib-docs/<lib>/VERSION` = current package.json version.
  6. Output JSON `{verdict: OK|WARN, snapshotPath, warnings[]}`.
- **Fail mode** : WebSearch ou WebFetch fail (offline, rate-limit, 404). Conserve l'existant, ajoute warning à `sources.json.warnings[]`, verdict = WARN. Pas de BLOCK.

### 6.5 doc-curator.md (agent fresh, nouveau)

- **Model** : opus-4.6.
- **AllowedTools** : `Read` (path glob: `lib-docs/**`), `Write` (path glob: `lib-docs/<lib>/PATTERNS.md` only, single file). **PAS** d'Edit, **PAS** de WebSearch/WebFetch (séparation responsabilité).
- **Input brief** : `{lib, snapshotPath, lessonsPath}`.
- **Workflow** :
  1. Read snapshot raw (peut être gros, c'est le sacrifice fenêtre de cet agent).
  2. Read LESSONS.md (read-only, jamais overwrite).
  3. Extract sections structurées dans `PATTERNS.md` : `## Imports canoniques`, `## Top APIs`, `## Patterns recommandés (Do)`, `## Anti-patterns (Don't)`, `## Version-specific gotchas (v<X>)`, `## Migration notes from v<X-1>`.
  4. Cible : 200-500 lignes, scannable.
  5. Output JSON `{verdict: OK, patternsPath, sha256}`.
- **Pourquoi séparé du fetcher** : le snapshot raw peut être 50KB+ par lib. L'agent curator dépense sa fenêtre dessus, mais les agents principaux (red/green/reviewer) ne consomment QUE le PATTERNS.md curaté (~500 lignes max). Préserve la fenêtre des agents critiques.

### 6.6 Stratégie WebSearch fail

Option 2 retenue (WARN + use stale + tag) :

1. Si doc-fetcher emit WARN → INDEX.json.libs[lib].warnings[] = `{ts, age, reason}`.
2. Le brief de la phase downstream (red/green/reviewer) inclut le warning verbatim.
3. PATTERNS.md existant (peut être >14j) reste utilisé.
4. Le reviewer voit le warning dans le bundle, peut downgrade verdict à CHANGES_REQUESTED si la lib est critique (auth/crypto/llm).
5. Pas de BLOCK auto.

### 6.7 Detection des libs (imports parser)

`pre-phase-doc-freshness.sh` workflow :

```bash
# 1. List staged files matching code globs
CODE_FILES=$(git diff --name-only --cached -- 'museum-backend/src/**/*.ts' 'museum-frontend/**/*.{ts,tsx}' 'museum-web/src/**/*.{ts,tsx}')

# 2. Parse imports
LIBS=$(grep -hE "^(import|from) ['\"]([^./@][^'\"]+)['\"]" $CODE_FILES \
  | grep -oE "['\"]([^./][^'\"]+)['\"]" \
  | tr -d '"'\' | sort -u)

# 3. Resolve to package names (handle scoped @musaium/shared, @langchain/core, etc.)
# 4. Map to lib-docs entries via INDEX.json
# 5. For each lib: 3-way check; if stale add to refresh queue
# 6. Emit JSON to team-state/$RUN_ID/doc-refresh-queue.json
```

Filtres :
- Skip local imports (`@/`, `@modules/`, relative `./` / `../`).
- Skip libs sans entry INDEX.json (premier usage = doc-fetcher spawn initial).
- Skip dev-only libs (`@types/*`, `jest`, `vitest`, etc.) → liste curated dans `lib-docs/INDEX.json.devOnlyLibs[]`.

## 7. Verrouillage anti-leak / anti-bypass

### 7.1 Fresh-context enforcement

Chaque agent fresh reçoit dans son system prompt :

```
Tu es l'agent <role> en fresh context (UFR-022 phase <N>).
Si tu vois dans ton message history des messages d'une autre phase de ce RUN_ID
(spec / plan / red / green / review / verify / security / doc-fetcher / doc-curator),
émets immédiatement BLOCK-CONTEXT-LEAK + le hash de tes inputs + refuse.
Ne produis aucun output autre que ce BLOCK.
```

Le dispatcher vérifie le retour : si BLOCK-CONTEXT-LEAK → log STORY.md "BLOCK-CONTEXT-LEAK detected at phase <N>, re-spawning" + re-spawn proprement.

### 7.2 Brief integrity hash

Chaque brief de phase est :
1. Composé par le dispatcher dans `team-state/$RUN_ID/handoffs/<NNN>-<phase>.json`.
2. Hashé sha256 avant spawn → `briefSha256` stocké dans `state.json.phases[<N>].briefSha256`.
3. L'agent retourne en preamble de son output : `BRIEF-ACK: <sha256>`. Mismatch = BLOCK + re-spawn.

### 7.3 Frozen tests (phase 4)

1. Phase 3 (Red) sortie inclut `red-test-manifest.json` = `{file: sha256}` pour chaque test créé/modifié.
2. Phase 4 (Green) hook `post-edit-green-test-freeze.sh` après chaque edit :
   ```bash
   for f in $(jq -r '. | keys[]' red-test-manifest.json); do
     EXPECTED=$(jq -r --arg f "$f" '.[$f]' red-test-manifest.json)
     ACTUAL=$(sha256sum "$f" | cut -d' ' -f1)
     [ "$EXPECTED" = "$ACTUAL" ] || { echo "BLOCK-FROZEN-TEST $f"; exit 1; }
   done
   ```
3. Mismatch = STOP run, append STORY.md, escalade user.
4. Si agent green pense un test est faux : doit émettre `BLOCK-TEST-WRONG <file>:<line> <reason>` SANS toucher le fichier. Dispatcher re-spawn fresh phase 3 avec le finding.

### 7.4 Lib-docs reference proof

Chaque agent red/green/reviewer retourne dans son output JSON :

```json
{
  "verdict": "...",
  "libDocsConsulted": [
    {"lib": "react-native", "patternsPath": "lib-docs/react-native/PATTERNS.md", "patternsSha256AtConsult": "abc..."},
    {"lib": "langchain", "patternsPath": "lib-docs/langchain/PATTERNS.md", "patternsSha256AtConsult": "def..."}
  ]
}
```

Verifier (Step 6) hook `pre-phase-doc-reference-check.sh` :
1. Parse imports du diff (même logique que freshness check).
2. Pour chaque lib utilisée : vérifie qu'elle apparaît dans `libDocsConsulted[]` du dernier agent red/green.
3. Vérifie que `patternsSha256AtConsult` matches `INDEX.json.libs[lib].patternsSha256` (sinon = drift entre consult et output, re-fresh).
4. Lib utilisée mais absente de `libDocsConsulted[]` → BLOCK + re-spawn la phase concernée.

## 8. Reviewer rejection loop — illimité

- `state.json.telemetry.reviewerRejectionLoops` : compteur, incrémenté à chaque CHANGES_REQUESTED.
- Aucun seuil de warning, aucun cap, aucune surface user automatique.
- Re-spawn fresh à la phase pointée par le reviewer dans le verdict JSON `{verdict: CHANGES_REQUESTED, reSpawnPhase: "spec|plan|red|green"}`.
- `intraPhaseHookLoops` (cap 2) reste inchangé pour les fails de hooks dans une même phase.

V12 §8 REGLE ABSOLUE #14 amendée :
> ~~Cap 2 boucles correctives ENFORCED~~ → **Cap 2 corrective loops s'applique aux intra-phase hook failures (lint/tsc/test fails dans une même phase éditeur). Aucun cap sur reviewer rejection loops (UFR-022).**

## 9. Tasks.md — multi-cycle tracking

Format `tasks.md` produit par phase Plan :

```markdown
# Tasks — <feature slug>

## Atomic tasks (this run)

- [ ] T1.1 — <description>
- [ ] T1.2 — ...
- [x] T1.3 — <done in previous run, completed at <run-id>>

## Multi-cycle progress (long-running feature)

Parent feature: <PARENT_SLUG> (started <date>, est <N> cycles)

### Cycles completed
- <run-id-1> — T1.1, T1.2 (auth scaffolding)
- <run-id-2> — T2.1 (refresh token)

### Cycles pending
- T3.x — RBAC (next run)
- T4.x — Audit log

### Acceptance criteria (feature-level)
- [ ] AC1 — ...
- [x] AC2 — done at <run-id-2>
```

Au Step 0 INIT, si la description matche une feature multi-cycles existante (slug match), le dispatcher charge la dernière version + l'inclut dans le brief de phase Plan. Plan phase amende les sections "Cycles completed" et "Acceptance criteria".

**Persistence anti-pruning** : `team-state/<run-id>/` est pruned >30j. Pour éviter de perdre l'historique d'une feature longue, à chaque run dont `tasks.md` contient une section `## Multi-cycle progress` non vide, le dispatcher copie le `tasks.md` en `team-state/multi-cycle-features/<feature-slug>/tasks-latest.md` (overwrite) + `tasks-<run-id>.md` (snapshot). Ce dossier est exempté du pruning >30j. Découverte au Step 0 INIT via `ls team-state/multi-cycle-features/*/tasks-latest.md` matchant le slug de la description.

Pas d'auto-link vers TaskCreate du main session. L'opérateur peut manuellement mirror via `/team learning:review` ou commandes ad-hoc.

## 10. Cost gate — telemetry only

Step 2.5 amendé :
- `cost-estimate.sh` exécuté inchangé (output JSON tokens + USD).
- `state.json.telemetry.estimated*` populé inchangé.
- **Suppression** des thresholds `$20 warn` / `$50 refuse`.
- **Conservation** du flag `--no-cost-estimate` (override audit).
- Step 9 finalize : cost delta inchangé (KR1 audit hebdo continue).

## 11. Fichiers touchés — diff inventory

### 11.1 Nouveau / modifié

| # | Path | Action |
|---|---|---|
| 1 | `.claude/agents/shared/user-feedback-rules.json` | append UFR-022 |
| 2 | `CLAUDE.md` | add §Fresh-context 5-phase + lib-docs (UFR-022) |
| 3 | `.claude/skills/team/SKILL.md` | gros refactor — mode unique, 5-phase, lib-docs wiring, V12 §8 amend, cost gate amend |
| 4 | `.claude/skills/team/team-hooks/pre-phase-doc-freshness.sh` | NOUVEAU — lib detection + 3-way staleness check |
| 5 | `.claude/skills/team/team-hooks/post-edit-green-test-freeze.sh` | NOUVEAU — sha256 freeze tests phase 3 |
| 6 | `.claude/skills/team/team-hooks/pre-phase-doc-reference-check.sh` | NOUVEAU — verifier assertion libDocsConsulted[] |
| 6b | `.claude/skills/team/team-hooks/pre-phase-pure-doc-check.sh` | NOUVEAU — exemption pipeline si diff = 0 code file |
| 7 | `.claude/agents/architect.md` | add §Fresh-context contract (phase spec OR plan) |
| 8 | `.claude/agents/editor.md` | add §Fresh-context contract (phase red OR green) + frozen-test + lib-docs obligation |
| 9 | `.claude/agents/reviewer.md` | add lib-docs obligation + frozen-test cross-check + illimité loop |
| 10 | `.claude/agents/verifier.md` | add lib-docs reference assertion |
| 11 | `.claude/agents/security.md` | add §Fresh-context contract |
| 12 | `.claude/agents/documenter.md` | add §Fresh-context contract |
| 13 | `.claude/agents/learning-curator.md` | add §Fresh-context contract |
| 14 | `.claude/agents/doc-fetcher.md` | NOUVEAU |
| 15 | `.claude/agents/doc-curator.md` | NOUVEAU |
| 16 | `.claude/skills/test-writer/SKILL.md` | add §Fresh-context contract |
| 17 | `.claude/skills/verify-schema/SKILL.md` | add §Fresh-context contract |
| 18 | `.claude/skills/security-scan/SKILL.md` | add §Fresh-context contract |
| 19 | `.claude/skills/rollback/SKILL.md` | add §Fresh-context contract |
| 20 | `.claude/skills/recap/SKILL.md` | add §Fresh-context contract |
| 21 | `lib-docs/README.md` | NOUVEAU — structure + politique LESSONS.md only |
| 22 | `lib-docs/INDEX.json` | NOUVEAU — `{"version":"1.0","libs":{},"devOnlyLibs":[...]}` |
| 23 | `lib-docs/.gitignore` | NOUVEAU — ignore tout sauf INDEX.json + README.md + */LESSONS.md |
| 24 | `.gitignore` (root) | patch — whitelist `lib-docs/INDEX.json` + `lib-docs/README.md` + `lib-docs/**/LESSONS.md` |
| 25 | `state.schema.json` (team-state) | add fields `phases[].briefSha256`, `telemetry.reviewerRejectionLoops`, `telemetry.intraPhaseHookLoops`, gates `doc-fetcher`, `doc-curator`, `frozen-test`, `lib-docs-reference` |

### 11.2 V12 § amendments (dans SKILL.md)

- §8 REGLE ABSOLUE #14 : reword cap policy (voir §8 ce doc).
- Step 2.5 : remove threshold blocks (voir §10).
- Step 4 closing gate : remove keywords bypass (voir §5.1).
- Step 4 split en 4a (spec) + 4b (plan).
- Step 5 split en 5a (red) + 5b (green) + Step 4.5 (doc freshness).
- Removed: `compose:`, mode selector matrix, pipeline branching (`micro`/`standard`/`enterprise`). Voir §12 trade-offs.

## 12. Trade-offs & risques

### 12.1 Latency / cost

- Pipeline minimum : 9 agent spawns (architect ×2, doc-fetcher ×N, doc-curator ×N, editor ×2, verifier, security, reviewer, documenter) + possibles re-spawns reviewer illimités.
- Pour une feature standard avec 3 libs touchées dont 1 stale : ~10-12 spawns first run.
- Cache warm-up V12 §6 mitige le préfixe répété mais chaque agent fresh paie sa propre fenêtre d'inputs.
- **Décision user** : cost = telemetry seul, pas un frein. On absorbe.

### 12.2 First-time clone overhead

- `lib-docs/` snapshots non commités → premier `/team` après clone refresh TOUTES les libs encountrées.
- Mitigation : doc-fetcher est spawné par lib indépendamment (peut paralléliser read-only).
- Acceptable pour solo-dev / Tech Lead unique. Si élargissement équipe (B2B post-revenue) → reconsidérer commit des snapshots.

### 12.3 Reviewer illimité

- Risque spirale : reviewer en désaccord avec architect sur design fundamental → loop infini.
- Mitigation absente par design (user a explicitement refusé warning). Confiance dans le user pour interrompre via Ctrl-C si la spirale est visible.
- Telemetry `reviewerRejectionLoops` permet audit hebdo : si une feature a >10 loops, signal pour reconsidérer scope manuellement.

### 12.4 Frozen-test edge cases

- Refactor de tests existants (renaming describe, déplacement file) : couvert ? **Non** — le manifest sha256 est strict. Si phase 3 produit un test puis le déplace après reconsidération, phase 4 voit deux fichiers nouveaux (l'ancien hash invalid + le nouveau non manifest). Edge case rare ; à traiter au cas par cas via BLOCK-TEST-WRONG → re-spawn fresh red.

### 12.5 Lib-docs warning silencieux

- Doc-fetcher WARN ne bloque pas. Cumul de warnings (lib stale + lib non-fetchable) pourrait passer review sans signal fort.
- Mitigation : reviewer reçoit la liste `warnings[]` dans son brief, est instruit d'appliquer CHANGES_REQUESTED si lib critique (auth/crypto/llm) a un warning.

## 13. Migration & rollout

### 13.1 Ordre d'implémentation (sera détaillé dans le plan)

1. UFR-022 JSON + CLAUDE.md prose (doctrine en place avant code).
2. `lib-docs/` scaffolding (INDEX, README, .gitignore patch).
3. `doc-fetcher.md` + `doc-curator.md` agents (peuvent être testés indépendamment).
4. `pre-phase-doc-freshness.sh` hook.
5. `post-edit-green-test-freeze.sh` hook.
6. `pre-phase-doc-reference-check.sh` hook.
7. `architect.md` / `editor.md` / `reviewer.md` updates (fresh-context contract + frozen-test + lib-docs).
8. Autres agents (verifier, security, documenter, learning-curator) updates.
9. Workflow skills updates (test-writer, verify-schema, security-scan, rollback, recap).
10. `.claude/skills/team/SKILL.md` gros refactor (mode unique, split phases, cost gate, V12 §8 amend).
11. Bootstrap initial : run doc-fetcher + doc-curator sur les ~15 libs top (RN, Expo, React 19, langchain, langgraph, openai, anthropic, zod, typeorm, express, jest, vitest, etc.) — INDEX.json populated.
12. Test end-to-end avec une feature pilote (TBD au moment d'exécuter le plan).

### 13.2 Backwards compat

Aucune. Le pipeline `/team` change radicalement. Les runs en cours au moment du merge devront être resume via `/team resume:<run-id>` qui détectera l'ancien schema et émettra un warning.

### 13.3 Critères d'acceptation feature-level

- [ ] UFR-022 dans user-feedback-rules.json
- [ ] CLAUDE.md contient la section Fresh-context 5-phase
- [ ] `/team feature "test"` run produit spec.md / design.md / tasks.md séparés en 2 spawns architect distincts (vérifié par log fresh-context dans state.json.phases[])
- [ ] `/team feature "test"` run produit tests phase 3 + code phase 4 en 2 spawns editor distincts
- [ ] Hook frozen-test bloque si test modifié en phase 4 (test pilote : feed mock diff qui touche un test, attend exit 1)
- [ ] Hook doc-freshness détecte une lib stale et déclenche doc-fetcher + doc-curator
- [ ] Reviewer CHANGES_REQUESTED loop 3× sans cap (test pilote)
- [ ] Pure-doc edit (markdown only) skip pipeline correctement
- [ ] `lib-docs/INDEX.json` + `README.md` + `*/LESSONS.md` trackés ; snapshots/PATTERNS.md untracked (vérifié `git status`)
- [ ] Toutes les UFR existantes (001-021) toujours passent leurs propres gates
- [ ] Tests existants Musaium (5637 passing baseline) toujours passing après le refactor

## 14. Open questions (à traiter en plan ou en exécution)

- Comment bootstrap initial des ~15 libs sans bloquer le premier `/team` ? Probablement un script `bin/lib-docs-bootstrap.sh` à lancer manuellement avant le premier run.
- Format exact des sections PATTERNS.md (template fixe vs free-form curator) — à voir dans le plan.
- Que faire si un dev clone le repo et lance `/team` sans accès réseau (WebSearch impossible) ? Probablement INDEX.json absent localement → tout est stale → tout WARN. Acceptable per §6.6.
- Faut-il un mécanisme de "lib alias" (e.g. `@langchain/core` et `@langchain/openai` partagent les mêmes docs LangChain) ? Probablement oui dans INDEX.json via champ `aliases[]`. À spec dans le plan.

---

**End of design. Awaiting user review before transition to writing-plans.**
