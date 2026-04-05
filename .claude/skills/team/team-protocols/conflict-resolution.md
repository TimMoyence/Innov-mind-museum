# Conflict Resolution — Protocole de resolution

Quand 2 agents ou le Tech Lead et un agent ont des conclusions contradictoires.
Charge en mode **enterprise** uniquement.

---

## PROCEDURE

```
1. EVIDENCE — Chaque partie presente ses preuves (code, tests, metriques)
2. CROSS-VALIDATION — Le Tech Lead fait sa propre verification independante
3. SYNTHESE — Determiner quelle approche est correcte basee sur les faits
4. ESCALADE — Si impossible de trancher → demander a l'utilisateur
```

## CAS COURANTS

### Agent A et Agent B modifient le meme fichier
```
1. Identifier qui a modifie en premier (timestamps)
2. Si modifications non-conflictuelles → merge manuel par Tech Lead
3. Si modifications conflictuelles → choisir la version la plus coherente
4. L'autre agent est respawne avec les modifications mergees comme contexte
```

### Agent contredit le plan
```
1. L'agent a-t-il une raison technique valide ? (Discovery)
2. Si oui → Tech Lead evalue et ajuste le plan
3. Si non → l'agent re-execute selon le plan original
```

### Sentinelle FAIL conteste par le Tech Lead
```
1. Le Tech Lead doit fournir une justification ecrite
2. La justification est loguee dans le rapport de run
3. Le run peut continuer avec un WARN (pas PASS)
4. L'overrule est enregistre dans velocity-metrics pour suivi
```
