# Error Taxonomy — Classification et reponse

Classification des erreurs rencontrees pendant un run SDLC.
Charge **Toujours** (mode unique UFR-022).

> Note: les E-codes ci-dessous sont locaux a ce fichier. Ils ne sont PAS l'enum
> de `team-knowledge/error-patterns.json` (`import-broken|type-mismatch|...`).
> Si une reconciliation est souhaitee, mapper E-IMPORT→import-broken,
> E-TYPE→type-mismatch, etc. — sinon ils restent orphelins.

---

## CLASSES D'ERREURS

| Code | Type | Description | Severite par defaut |
|------|------|-------------|---------------------|
| E-IMPORT | Import casse | Symbole/fichier importe n'existe pas ou a change de signature | HIGH |
| E-TYPE | Type mismatch | Types incompatibles entre modules ou agent outputs | HIGH |
| E-SCOPE | Scope overflow | Agent modifie des fichiers hors de son scope autorise | MEDIUM |
| E-TEST | Test regression | Tests existants cassent apres modification | HIGH |
| E-LINT | Lint violation | Nouveau eslint-disable ou tsc error | MEDIUM |
| E-ARCH | Architecture violation | Non-respect des patterns hexagonaux, imports cross-feature | LOW |
| E-RUNTIME | Runtime error | Erreur detectee au smoke test ou E2E | CRITICAL |
| E-STYLE | Style/convention | Nommage incorrect, fichier mal place | LOW |

## RESPONSE MATRIX

| Severite | Bloque commit ? | Action immediate ? | Boucle corrective ? | Escalade apres |
|----------|----------------|-------------------|---------------------|----------------|
| CRITICAL | Oui | Oui | Oui — prioritaire | cap intra-phase (2) ; reviewer illimite |
| HIGH | Oui | Oui | Oui | cap intra-phase (2) ; reviewer illimite |
| MEDIUM | Non (WARN) | Recommande | Optionnel | cap intra-phase (2) ; reviewer illimite |
| LOW | Non | Non | Non | Jamais |

> "Escalade apres" suit la doctrine UFR-022 (cf. SKILL.md REGLE 14) : les boucles
> correctives intra-phase (hook lint/tsc/test fails) cap a 2 → STOP + escalade ;
> les boucles de rejet reviewer sont ILLIMITEES. La severite n'altere PAS ce cap.

## BOUCLE CORRECTIVE

```
1. Identifier la classe d'erreur (E-IMPORT, E-TYPE, etc.)
2. Determiner la phase de re-spawn (UFR-022 9-phase: spec, plan, red, green, verify, security, review):
   - E-IMPORT, E-TYPE → re-spawn fresh phase=green (l'editeur corrige le code applicatif)
   - E-SCOPE → re-spawn fresh phase=plan (le scope etait mal defini)
   - E-TEST → re-spawn fresh phase=green (l'editeur corrige le code, PAS le test — frozen-test)
   - E-ARCH → re-spawn fresh phase=plan (si structural) ou phase=green (si local)
   - E-RUNTIME → re-spawn fresh la phase pointee ; le smoke/E2E est re-execute par le gate verify (hooks) et l'investigation revient au reviewer / a l'editeur green selon la cause
3. Le dispatcher (PAS l'agent) compose un nouveau handoff JSON ≤200 tokens pointant
   vers les artefacts read-only sur disque (spec.md / design.md / diff). Pas de
   TaskCreate, pas de continuation: chaque correction = un Agent spawn fresh,
   zero memory de la phase precedente (UFR-022 fresh-context).
4. Le brief de correction inclut: message d'erreur exact, fichiers concernes,
   PE pertinents (si EP existe pour ce type d'erreur dans error-patterns.json).
5. Re-executer la phase pointee depuis le point de correction.
6. Doctrine de cap (UFR-022, cf. SKILL.md REGLE 14):
   - Boucles correctives INTRA-PHASE (lint/tsc/test fails dans la MEME phase editeur):
     cap 2 (`telemetry.intraPhaseHookLoops >= 2`) → STOP + escalade utilisateur.
   - Boucles de rejet REVIEWER: **ILLIMITEES**, zero cap, zero warning auto. Si le
     reviewer rejette N fois, c'est qu'il y a raison; re-spawn fresh la phase pointee.
```

## ENREGISTREMENT

Chaque boucle corrective = 1 entry dans error-patterns.json (cf. finalize.md).
