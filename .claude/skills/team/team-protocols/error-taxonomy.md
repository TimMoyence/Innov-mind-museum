# Error Taxonomy — Classification et reponse

Classification des erreurs rencontrees pendant un run SDLC.
Charge en mode **enterprise** uniquement.

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
| CRITICAL | Oui | Oui | Oui — prioritaire | 1 tentative |
| HIGH | Oui | Oui | Oui | 2 tentatives |
| MEDIUM | Non (WARN) | Recommande | Optionnel | 3 tentatives |
| LOW | Non | Non | Non | Jamais |

## BOUCLE CORRECTIVE

```
1. Identifier la classe d'erreur (E-IMPORT, E-TYPE, etc.)
2. Determiner le point de retour:
   - E-IMPORT, E-TYPE → retour DEVELOPPER (meme agent si c'est son scope)
   - E-SCOPE → retour PLANIFIER (le scope etait mal defini)
   - E-TEST → retour DEVELOPPER (agent corrige)
   - E-ARCH → retour CONCEVOIR (si structural) ou DEVELOPPER (si local)
   - E-RUNTIME → retour TESTER (agent QA investigue)
3. Creer TaskCreate("correction-{phase}-{error_code}-{loop_count}")
4. Spawner agent de correction avec:
   - Message d'erreur exact
   - Fichiers concernes
   - PE pertinents (si EP existe pour ce type d'erreur)
5. Re-executer depuis le point de correction
6. Max 3 boucles (2 pour CRITICAL) → escalade utilisateur
```

## ENREGISTREMENT

Chaque boucle corrective = 1 entry dans error-patterns.json (cf. finalize.md).
