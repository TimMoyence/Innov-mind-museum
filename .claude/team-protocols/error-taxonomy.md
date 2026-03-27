# Error Taxonomy & Protocole de Correction

## Classification des Erreurs

Chaque erreur trouvee pendant un run est classifiee :

| Champ | Valeurs | Description |
| ----- | ------- | ----------- |
| **Source** | `lint` / `type` / `test` / `review` / `sentinel` | Ou l'erreur a ete detectee |
| **Severite** | `blocker` / `error` / `warning` / `info` | Impact sur la progression |
| **Code** | Ex: `TS2556`, `TS2345`, `jest/expect`, `hexa/import-violation` | Code d'erreur specifique et stable |
| **Fichier** | `path:line:col` | Localisation exacte |
| **Introduite par** | `agent:<nom>` / `pre-existing` / `tech-lead` | Qui a introduit l'erreur |
| **Auto-fixable** | `yes` / `no` | Peut etre corrigee automatiquement |
| **Statut** | `open` / `fixed` / `deferred` / `false-positive` | Etat actuel |

## Regles

- `blocker` et `error` → DOIVENT etre `fixed` avant de passer une porte
- `warning` → peut etre `deferred` avec justification
- `pre-existing` → ne bloquent pas mais sont trackees
- `false-positive` → signalees a la Sentinelle (baisse score agent source)

**Les erreurs sont reportees dans les SendMessage aux portes Sentinelle** avec leur classification complete.

---

## Protocole de Correction (Boucles)

Quand une porte Sentinelle donne **FAIL**, la boucle corrective suit un protocole formel.

### 1. Diagnostic Racine

| Type | Symptome | Retour vers |
| ---- | -------- | ----------- |
| **Code** | Bug, typecheck fail, convention non respectee | Phase 4 — DEV |
| **Design** | Architecture inadaptee, interface mal concue | Phase 2 — DESIGN |
| **Requirement** | Demande mal comprise ou ambigue | Phase 1 — ANALYSE (+ question utilisateur) |

### 2. Scope de Correction

Le Tech Lead identifie **exactement** ce qui doit etre corrige :
- Fichiers concernes (chemin + lignes)
- Comportement attendu vs observe
- Recommandation Sentinelle a appliquer

### 3. Correction Ciblee

L'agent re-spawne (ou Tech Lead directement) recoit un mandat de **correction** :
- Scope = uniquement les fichiers/comportements identifies
- Pas de refactoring opportuniste
- Pas de scope creep

### 4. Re-verification

Apres correction, reprendre le cycle **depuis la phase de correction** :
- Correction en DEV → re-passer REVIEW → TEST
- Correction en DESIGN → re-passer PLAN → DEV → REVIEW → TEST

### 5. Compteur de Boucles

| Boucle | Action |
| ------ | ------ |
| 1ere   | Normal — une correction est attendue |
| 2eme   | Le Tech Lead analyse pourquoi la 1ere n'a pas suffi |
| 3eme   | **Escalade utilisateur** — probleme structurel ou mal defini |
