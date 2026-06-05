# Systematic Debugging — protocole /team (UFR-022)

> **Absorbé de `superpowers:systematic-debugging` (2026-05-31, direction Q4).** Méthodologie
> vendored ici pour que /team reste self-contained (aucune dépendance au plugin). /team ajoute
> ce que le skill en prose n'a pas : un **artefact `debug-log.md` + un hook d'enforcement**
> (`pre-complete-debug-log-check.sh`) — la discipline devient vérifiable, pas honor-system.
> Crédit méthodologie : Obra/superpowers.

## La Loi de Fer

```
AUCUN FIX SANS INVESTIGATION DE ROOT-CAUSE D'ABORD.
```

Un fix de symptôme = un échec. Violer la lettre de ce process = violer l'esprit du debugging.

## Quand ce protocole s'applique dans /team

Trois moments du pipeline déclenchent ce protocole :

1. **Phase green (editor #2)** — le code écrit ne rend pas les tests rouges verts, OU casse un test voisin. Le hook `post-edit-typecheck.sh` / `post-edit-lint.sh` / `pre-complete-verify.sh` échoue.
2. **Gate verify (Step 6)** — un hook du gate (`pre-complete-verify.sh`) sort ≠ 0.
3. **E-RUNTIME** (cf. `error-taxonomy.md`) — smoke / E2E rouge en runtime, pas en compile.

**Surtout** quand : le fix précédent n'a pas marché, sous pression deadline, « juste un petit fix » paraît évident, ≥2 tentatives déjà faites.

## Les 4 phases (à compléter dans l'ordre, écrites dans `debug-log.md`)

### Phase 1 — Root-cause investigation (AVANT tout fix)
1. **Lire le message d'erreur en entier** — stack trace complet, fichier:ligne, code d'erreur. Il contient souvent la solution exacte.
2. **Reproduire** — déclenchable de façon fiable ? Étapes exactes ? Sinon → rassembler plus de données, ne pas deviner.
3. **Vérifier les changements récents** — `git diff $(startCommit)..HEAD`, deps/config/env nouveaux.
4. **Instrumenter les frontières de composants** (systèmes multi-couches — fréquent ici : `route → chat.service → guardrail V1/V2 → LLM adapter → cache`, ou `migration → TypeORM → PG`). AVANT de proposer un fix, logger ce qui ENTRE et ce qui SORT de chaque frontière, lancer UNE fois → voir OÙ ça casse, PUIS investiguer ce composant précis. (cf. `defense-in-depth` après root-cause trouvé.)
5. **Tracer le data-flow** — d'où vient la mauvaise valeur ? Qui a appelé avec elle ? Remonter jusqu'à la source. Fixer à la SOURCE, pas au symptôme. (Pattern récurrent du repo : `feedback_jsonb_drift_guard`, `feedback_closure_cell_cancellation_react_hooks`.)

### Phase 2 — Pattern analysis
- Trouver un exemple QUI MARCHE dans le même codebase (module/feature voisin).
- Lire la référence COMPLÈTEMENT (la lib via `lib-docs/<lib>/PATTERNS.md` + `LESSONS.md`, REGLE 15 — ne pas improviser depuis le training).
- Lister CHAQUE différence working↔broken, même minime. Pas de « ça ne peut pas compter ».

### Phase 3 — Hypothesis & testing
- **UNE seule hypothèse** : « Je pense que X est la root-cause parce que Y ». Écrite (`Hypothesis:` dans le log).
- **Test minimal** : le plus petit changement possible, UNE variable à la fois.
- Ça marche → Phase 4. Ça ne marche pas → NOUVELLE hypothèse (ne pas empiler les fixes).
- « Je ne comprends pas X » est une réponse valide → escalade, ne pas prétendre.

### Phase 4 — Implementation
1. **Test rouge d'abord** (reproduction minimale) — via `superpowers:test-driven-development` / phase red. En /team : si la root-cause n'était pas couverte par un test red, c'est un `BLOCK-TEST-WRONG` → re-spawn fresh red qui ajoute le cas.
2. **UN seul fix** ciblant la root-cause. Pas de « tant que j'y suis », pas de refacto bundlé.
3. **Vérifier** : test passe ? aucun autre test cassé ? (full module suite — cf. `feedback_scoped_review_misses_contract_breakage`.)
4. **Si le fix échoue** : STOP. Compter les tentatives. < 2 → retour Phase 1 avec la nouvelle info. **≥ 2 (= cap /team `intraPhaseHookLoops`) → Phase 4.5.**

### Phase 4.5 — Au cap : QUESTIONNER L'ARCHITECTURE (≠ énième fix)
Signal d'un problème architectural (pas une hypothèse ratée) :
- chaque fix révèle un nouveau couplage / shared-state ailleurs ;
- chaque fix exige un « gros refacto » ;
- chaque fix crée un symptôme ailleurs.

→ **STOP + escalade Tech Lead** AVEC le `debug-log.md` (les hypothèses testées + pourquoi elles ont échoué). Question : ce pattern est-il fondamentalement sain, ou est-on dedans « par inertie » ? Refacto archi vs continuer à patcher les symptômes. C'est la sortie `intraPhaseHookLoops ≥ 2 → STOP` de REGLE 10, enrichie.

## Artefact `debug-log.md` (contrat enforce-able)

Dès que `state.json.telemetry.intraPhaseHookLoops ≥ 2` (≥2 tentatives correctives échouées dans la même phase), l'editor DOIT avoir écrit `team-state/<RUN_ID>/debug-log.md` :

```markdown
# Debug log — RUN_ID=<id> — phase=<green|verify>

## Phase 1 — Root cause
- Erreur (verbatim) : <message + fichier:ligne>
- Reproduction : <étapes / commande>
- Changements récents suspects : <git diff refs>
- Instrumentation frontières : <ce qui entre/sort, où ça casse>
- Data-flow / source : <où naît la mauvaise valeur>

## Phase 2 — Pattern
- Exemple qui marche : <path:line>
- Référence lib lue : lib-docs/<lib>/PATTERNS.md:<line>
- Différences working↔broken : <liste>

## Phase 3 — Hypotheses (une par tentative)
- Hypothesis 1: <X est la cause parce que Y> → test minimal <…> → résultat <pass|fail: raison>
- Hypothesis 2: <…> → <…>

## Phase 4 — Fix
- Root-cause fix : <path:line, 1 changement>
- Test red couvrant : <test path> (sinon BLOCK-TEST-WRONG → re-spawn red)
- Full module suite : <PASS|FAIL>

## Architecture question (obligatoire au cap intraPhaseHookLoops ≥ 2)
- Pattern sain ou inertie ? : <analyse>
- Décision proposée au Tech Lead : <refacto archi | continuer + justification>
```

Le hook `pre-phase-doc-reference-check.sh` (REGLE 15) reste indépendant : le debug-log ne dispense pas de la consultation lib-docs.

## Anti-patterns — STOP, retour Phase 1
« Quick fix pour l'instant », « change X et vois », « plusieurs changements puis run les tests »,
« skip le test, je vérifie à la main », « c'est probablement X », « le pattern dit X mais je l'adapte »,
proposer des solutions avant d'avoir tracé le data-flow, « une tentative de plus » (après 2+).
≥ 2 échecs en /team = Phase 4.5 (archi), pas Fix #3.

## Techniques de support (vendored brièvement)
- **root-cause-tracing** — remonter le call-stack jusqu'au déclencheur d'origine ; fixer à la source.
- **defense-in-depth** — APRÈS la root-cause trouvée, valider à plusieurs couches (cf. `CLAUDE.md § AI Safety` defense-in-depth, et `feedback_phase_span_dual_path_emit`).
- **condition-based-waiting** — remplacer les timeouts arbitraires par du polling de condition (tests flaky / async ; cf. `Monitor` until-loop, gotcha Stryker open-handles).

## Enforcement
`team-hooks/pre-complete-debug-log-check.sh` (gate verify, Step 6) : si `intraPhaseHookLoops ≥ 2`
et `debug-log.md` absent OU sans les marqueurs des 4 phases + une hypothèse + la section Architecture
→ FAIL (l'editor a tâtonné sans méthode) → re-spawn fresh green AVEC le protocole. Self-test inclus.
```
