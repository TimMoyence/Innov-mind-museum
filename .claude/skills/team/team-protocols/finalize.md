# Finalize — Protocole de cloture de run

Execute par le Tech Lead a la fin de chaque run (Phase LIVRER).
Charge en mode **standard** (partiel) et **enterprise** (complet).

---

## STANDARD — Finalize leger

```
1. error-patterns.json: enregistrer toute boucle corrective du run
   - 1 entry par boucle: type, description, agent, phase, fix
   - Si pattern existant (meme type + meme description) → incrementer occurrences + update lastSeen
   - Si nouveau pattern → creer avec status "unfixed" si non resolu dans ce run, "fixed" sinon

2. velocity-metrics.json: enregistrer le run
   - pipeline, mode, duration, agents_spawned, corrective_loops, tsc_fails_post_agent, files_modified

3. quality-ratchet.json: write-on-improve
   - Si testCount augmente → update
   - Si asAnyCount diminue → update
   - Ajouter entry dans history[]
```

---

## ENTERPRISE — Finalize complet

Tout le standard PLUS :

```
4. prompt-enrichments.json: scoring PE
   Pour chaque PE injecte dans ce run :
   a. Evaluer le score (0-5) base sur :
      - L'agent a-t-il suivi le PE ? (oui=3+, non=1)
      - Le PE a-t-il prevenu une erreur connue ? (oui=5)
      - Le PE a-t-il eu un impact mesurable ? (pas clair=2)
   b. Mettre a jour le score (moyenne glissante sur 3 runs)
   c. Si score < 2 sur 3+ runs → status = "reformulate"
      - Sentinelle propose une nouvelle formulation
      - Nouveau PE cree avec id suffixe -R1
   d. Si score = 0 sur 5+ runs → status = "retired"

5. agent-performance.json: evaluation agent
   Pour chaque agent spawne dans ce run :
   a. Score qualite (1-10) base sur :
      - Code compile sans erreur au 1er essai ? (+3)
      - Tests passent sans correction ? (+2)
      - Scope respecte ? (+2)
      - Import coherence respectee ? (+2)
      - Decouvertes utiles signalees ? (+1)
   b. Mettre a jour avgScore (moyenne glissante)
   c. Mettre a jour specializations[task-type]
   d. Si erreur recurrente → ajouter a weaknessHistory
   e. Evaluer ROI selon la grille

6. next-run.json: recommandations
   a. Generer recommandations basees sur :
      - Erreurs non corrigees ce run (priority +5)
      - Coverage gaps detectes (priority +4)
      - Process amendments proposes par Sentinelle (priority +3)
      - Optimisations suggerees (priority +1)
   b. Incrementer staleness_runs sur les recommendations existantes non adressees
   c. Si staleness_runs >= 3 → auto-apply (modifier le protocole/mandat concerne)
      - Logger l'auto-apply dans velocity-metrics

7. autonomy-state.json: evaluation niveau
   a. Si 3+ runs consecutifs PASS sans escalade utilisateur → proposer promotion
   b. Si BLOCK failure dans ce run → reset a L1
   c. Logger le changement dans history[]

8. estimation-accuracy.json: calibration
   a. Comparer estimation (fichiers, lignes, duration) vs reel
   b. Calculer ratio
   c. Mettre a jour avgRatio

9. team-reports/YYYY-MM-DD.md: Executive Summary
   - Score global, findings, metriques, recommendations
   - Agent performance summary
   - PE effectiveness summary

10. docs/V1_Sprint/: update tracking
    - PROGRESS_TRACKER.md: cocher les items completes
    - SPRINT_LOG.md: ajouter entry technique
```

---

## CREATION DE NOUVEAUX PE

A chaque finalize enterprise, la Sentinelle peut proposer de nouveaux PE bases sur :

```
1. Erreurs recurrentes (3+ occurrences du meme pattern) → PE preventif
2. Corrections manuelles frequentes par le Tech Lead → PE d'automatisation
3. Decouverte d'un pattern efficace par un agent → PE de partage
```

Format de proposition :
```json
{
  "proposed_pe": {
    "rule": "string",
    "inject_when": ["mode:..."],
    "inject_to": ["agent-name"],
    "justification": "based on EP-NNN recurring N times"
  }
}
```

Le Tech Lead valide ou rejette. Si valide → ajoute a prompt-enrichments.json avec score initial 3.0.
