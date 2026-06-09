# Test-Contract Phase + Shift-Left Hardening — Design

- **Date** : 2026-06-09
- **Statut** : ACCEPTED (brainstorming validé section-par-section par Tim)
- **Scope** : `/team` orchestrateur (UFR-022) + agents + hooks déterministes + docs. **Aucune modif de code applicatif** (`museum-backend/src`, `museum-frontend/{app,features,shared,components}`, `museum-web/src`, `tests/`) → exempt du pipeline 5-phase sur lui-même.
- **Décision de forme** : Approche C (agent `test-analyst` dédié), choisie contre la reco initiale B. Raison retenue : le test-analyst est un **mode cognitif adversarial** distinct de l'architecte (constructif), pas un doublon ; l'ajouter comble un trou réel et n'annule pas l'élagage 9→6 (qui visait des agents redondants).

---

## 1. Problème

Le pipeline `/team` UFR-022 est `spec → plan → doc-cache → red → green → verify → security → review → documenter`. Deux faiblesses, confirmées par Tim :

### 1.1 Fidélité intention → test (point #1)

L'énumération des cas de test est **implicite** : l'architecte écrit un `DONE-WHEN` terse par tâche dans `tasks.md` (phase plan) ; l'editor `red` lit ces `DONE-WHEN` et **invente** les assertions. Quatre symptômes, tous présents :

- **Tests ≠ intention** : un test vert peut ne pas couvrir ce que le spec voulait (l'editor red devine mal).
- **Use-cases oubliés** : erreurs, edge cases, chemins alternatifs jamais énumérés exhaustivement en amont.
- **Traçabilité floue** : impossible de prouver mécaniquement que chaque critère d'acceptation a ≥1 test.
- **Cohérence TDD** : « quoi tester » et « écrire le test » sont mélangés dans le même flux.

### 1.2 Bugs runtime/intégration qui s'échappent + gates tardifs (point #2)

Les gates sont énormes en statique (tsc, ESLint, ratchets, SAST) et en unit, mais **structurellement aveugles** aux comportements qui ne se manifestent que contre la vraie infra/le vrai build. Incidents de référence :

| Incident | Échappé jusqu'à | Pourquoi les gates l'ont raté |
|---|---|---|
| Quota free ne bloque jamais (402) | prod | unit test mockait le repo → jamais vu la forme `[rows, count]` du tuple `INSERT…RETURNING` (TypeORM/pg) |
| Build TestFlight → localhost | TestFlight | aucun test n'exerce ce qu'un *vrai build EAS prod* résout comme `API_BASE_URL` |
| Rollback prod mort (SHA-pinning) | prod (1er rollback réel) | aucun test n'exerce le chemin de rollback réel |

Le réflexe actuel est **réactif** : chaque incident → un nouveau sentinel improvisé (Gate 33 api-url, ESLint `no-typeorm-set-undefined`…). Ça marche mais court après le dernier incident.

---

## 2. Insight central : un seul mécanisme pour trois piliers

Les trois piliers (contrat de test · couche intégration · incident→gate) **ne sont pas trois chantiers** — c'est **un artefact, un champ, un registre** :

- **Un artefact** : `test-contract.md` (matrice de use-cases + matrice de couverture).
- **Un champ** : `Tier` par use-case (unit / integration / contract / e2e, règle mécanique ADR-012). Un UC taggé `integration` **force** un vrai test d'intégration → la couche intégration se remplit, pilotée par l'intention. C'est ce qui aurait bloqué le bug quota.
- **Un registre** : `INCIDENT_LEDGER.md`. Un bug échappé devient « un nouveau UC taggé `regression` dans le contrat du fix », avec un `Tier` ≥ le niveau qui l'aurait pris. L'incident→gate n'est pas un système à part : c'est le contrat de test réutilisé.

---

## 3. Composants

### 3.1 Agent `test-analyst` (nouveau)

- **Fichier** : `.claude/agents/test-analyst.md` · **model** : `claude-opus-4-8` (UFR-010) · **role** : `test-analyst`.
- **Position pipeline** : nouvelle phase entre `doc-cache` (Step 4.5) et `red` (Step 5a) → **Step 4.6 `test-contract`**.
- **Frontière de responsabilité** (le cœur de la séparation) :

  | Agent | Dit | Produit |
  |---|---|---|
  | architect (plan) | comment construire | `design.md` + `tasks.md` |
  | **test-analyst** | **quoi tester, tous les cas** | **`test-contract.md`** |
  | editor (red) | comment écrire le test | tests + manifest |
  | editor (green) | comment faire passer | code applicatif |

- **Mode cognitif (system prompt)** : adversarial. Mandat maître = *« pour chaque critère d'acceptation, énumère le chemin heureux PUIS tous les chemins par lesquels il échoue : erreur, edge, limite, concurrence, sécurité, et le comportement réel contre l'infra/le driver/le build »*.
- **N'écrit aucun test, aucun code.** Décrit l'*intention de test* (l'`Observable`), l'editor red la matérialise. Toucher du test/code = violation de phase.
- **Mécaniques fresh-context (identiques aux autres agents)** :
  - `allowedTools` : lecture + analyse uniquement (Read/Grep/Glob/Bash read-only/Write limité à `test-contract.md`/gitnexus query+context+impact/serena find+overview). **Pas d'Edit.**
  - Lit `spec.md` + `design.md` **depuis le disque**. Émet `BRIEF-ACK: <sha256>` en préambule. `BLOCK-CONTEXT-LEAK` si l'historique montre une autre phase du même RUN_ID.
  - Consulte `lib-docs/<lib>/PATTERNS.md` (factory discipline + marqueurs d'intégration). Sort `libDocsConsulted[]` comme red/green.
- **Verdict** : `READY-FOR-RED | BLOCKED-AWAITING-USER`.

### 3.2 Artefact `test-contract.md`

Template `.claude/skills/team/team-templates/test-contract.md.tmpl`. Deux blocs obligatoires :

```markdown
## Couverture (traçabilité bidirectionnelle)
| Critère (spec AC) | Use-cases couvrants |
|-------------------|---------------------|
| AC-1              | UC-1, UC-2, UC-3    |
| AC-2              | UC-4                |   ← cellule vide ⇒ Gate A ROUGE

## Use-cases
### UC-3 — Quota épuisé renvoie 402
- **Couvre**     : AC-1
- **Catégorie**  : error            (happy | error | edge | boundary | security | regression)
- **Tier**       : integration      (unit | integration | contract | e2e — règle ADR-012)
- **Factory**    : makeUser({ tier: 'free' }), makeQuota({ used: LIMIT })
- **Given**      : un user free dont le compteur mensuel = plafond
- **When**       : il consomme une session de plus
- **Then**       : 402, compteur NON incrémenté, aucune session créée
- **Observable** : status=402 ∧ SELECT count = LIMIT (pas LIMIT+1)
```

- `Observable` ≠ code de test : l'analyst dit *quoi observer*, l'editor red écrit *comment* (`expect`). Frontière étanche → pas de rubber-stamp.
- Règle de tier **mécanique** (ADR-012) : si le UC touche `DataSource` / vrai driver / réseau / build → `integration` ou `contract`, **interdit de le mocker en unit**.

### 3.3 Manifest red étendu

`red-test-manifest.json` passe de `{<path>: <sha256>}` à un format porteur de traçabilité, **rétro-compatible avec le freeze hook** (qui re-hashe par path, indifférent à la clé) :

```json
{ "UC-3": { "path": "tests/integration/quota.consume.test.ts", "sha256": "…" } }
```

`post-edit-green-test-freeze.sh` doit être adapté pour lire `.path`/`.sha256` aussi bien dans la forme plate historique que dans la forme `UC-id → {path,sha256}` (compat ascendante, zéro casse des runs existants).

### 3.4 Gates déterministes (4 hooks, zéro IA, mirrorables pre-push/CI)

| Gate | Hook | Quand | Vérifie | Exit |
|---|---|---|---|---|
| **A — Contrat clos** | `pre-red-contract-check.sh` | fin Step 4.6 | `test-contract.md` existe · matrice couverture **sans cellule vide** (chaque AC → ≥1 UC) · chaque UC a tous ses champs dont `Tier` valide | 0/1 |
| **B — Couverture UC** | `post-red-uc-coverage.sh` | fin Step 5a (red) | **bidirectionnel** : chaque UC-id du contrat → ≥1 entrée manifest **ET** chaque entrée manifest → un UC-id (zéro test orphelin) | 0/1 |
| **C — Enforcement tier** | `pre-complete-tier-enforcement.sh` | Step 6 verify | chaque UC `integration`/`contract`/`e2e` : test au bon path (`tests/integration/`, `tests/contract/`, `.maestro/`) **et** importe la vraie frontière (`DataSource`/testcontainer) | 0/1 |
| **D — Incident→gate** | `pre-complete-incident-regression-check.sh` | Step 6 verify | si le run référence un `INC-id` : `test-contract.md` contient ≥1 UC `Catégorie: regression` lié à cet INC-id **et** `Tier` ≥ `Tier-qui-l-aurait-pris` du registre | 0/1 |

Tous suivent l'idiome existant : `set -uo pipefail`, `REPO_ROOT` depuis `BASH_SOURCE`, skip gracieux si `RUN_ID`/`jq` absent, `emit_gate` vers `state.json.gates[]`, flag `--self-test`, exit 0 PASS / 1 FAIL.

### 3.5 Registre d'incidents

`docs/INCIDENT_LEDGER.md` (à whitelister dans `.gitignore`). Une ligne par bug échappé :

```markdown
| INC-id | Symptôme | Échappé jusqu'à | Tier-qui-l'aurait-pris | UC-régression | Fix commit |
```

La colonne **`Tier-qui-l'aurait-pris`** industrialise le réflexe réactif : le post-mortem est forcé de répondre *« à quel niveau de la pyramide ce bug devient visible ? »*, et le Gate D interdit de « corriger » un bug pg-réel avec un unit mocké. Cross-référencé par `INC-id` avec `post-complete-lesson-capture.sh` (vue machine).

---

## 4. Intégration pipeline

```
spec → plan → doc-cache → ★ test-contract ★ → red → green → verify → security → review → documenter
```

- **Step 4.6** (nouveau) : handoff `005-test-contract.json` (≤200 tok) dispatcher → test-analyst, `context_refs=[spec.md, design.md, lib-docs/INDEX.json]`, `outputPaths=[test-contract.md]`. Spawn fresh. Render HTML fail-open (comme spec/plan). Puis **Gate A**.
- **Step 5a (red)** : handoff modifié → `context_refs` ajoute `test-contract.md` ; tâche = « un test par UC-id ». Manifest étendu. Puis **Gate B**.
- **Step 6 (verify)** : ajoute **Gate C** + **Gate D** à la liste déterministe existante.
- **Green / review / security** : **inchangés**. Tout le poids est en amont + 2 gates de vérif. Le risqué (frozen-test, anti-rubber-stamp review) reste verrouillé à l'identique.

---

## 5. Enrôlement (docs + règles)

- `.claude/agents/shared/user-feedback-rules.json` : **UFR-022 amendée** — liste de phases passe à 6 (ajout `test-contract`), obligation `test-contract.md` + traçabilité UC bidirectionnelle + tier enforcement + incident→gate.
- `CLAUDE.md` § « Fresh-context 5-phase workflow » → **6-phase**, + mention `INCIDENT_LEDGER.md` + Gate C/D.
- `.claude/skills/team/SKILL.md` : Steps 4.6 / 5a / 6 (cf §4).
- `.claude/skills/team/team-sdlc-index.md` : ajouter l'agent + les 4 hooks dans les tables de record.
- `.claude/agents/editor.md` : phase=red lit `test-contract.md`, un test par UC-id, manifest étendu.
- `.claude/agents/architect.md` : note que l'énumération exhaustive des cas n'est plus de son ressort (le `DONE-WHEN` reste, mais le contrat de test exhaustif appartient au test-analyst).

---

## 6. Critères d'acceptation

- **AC-1** : `test-analyst.md` existe, frontmatter conforme (model opus, role, allowedTools sans Edit hors `test-contract.md`), sections `<role>/<context>/<task>/<constraints>/<output_format>`.
- **AC-2** : `test-contract.md.tmpl` existe avec les 2 blocs (Couverture + Use-cases) et les 7 champs par UC.
- **AC-3** : les 4 hooks existent, `bash <hook> --self-test` sort 0 pour chacun (≥6 scénarios couvrant PASS + chaque mode de FAIL).
- **AC-4** : `post-edit-green-test-freeze.sh` lit les deux formes de manifest (plate + UC-id) sans régression — self-test ou test ad hoc le prouve.
- **AC-5** : `SKILL.md` décrit Step 4.6 + Gate A/B/C/D câblés aux bons steps ; handoff JSON présent.
- **AC-6** : UFR-022 amendée (6 phases) ; `CLAUDE.md` § workflow reflète 6 phases.
- **AC-7** : `INCIDENT_LEDGER.md` existe, whitelisté dans `.gitignore`, seedé avec les 3 incidents de référence (quota, build-localhost, rollback-SHA).
- **AC-8** : `team-sdlc-index.md` liste le nouvel agent + les 4 hooks.

## 7. Non-objectifs (YAGNI)

- Pas de nouvel agent au-delà du test-analyst (pas de « test-reviewer » séparé — le reviewer Step 8 spot-checke déjà).
- Pas de réécriture des phases green/review/security.
- Pas de couverture chiffrée imposée (%) — la traçabilité UC↔AC est l'invariant, pas un seuil de coverage.
- Pas d'automatisation de la rédaction du registre d'incidents (rempli à la main au post-mortem ; seul le Gate D est automatique).
